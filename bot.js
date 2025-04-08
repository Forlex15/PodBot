import discord
from discord import app_commands
from discord.ext import commands, tasks
from datetime import datetime
from typing import Dict, List
import asyncio

# Bot setup
intents = discord.Intents.default()
intents.members = True
bot = commands.Bot(command_prefix="!", intents=intents)

# Database simulation
class Database:
    def __init__(self):
        self.distributors: Dict[int, 'Distributor'] = {}  # Key: Discord user ID
        self.current_month = datetime.now().month
        
    def get_distributor(self, user_id: int) -> 'Distributor':
        if user_id not in self.distributors:
            # Auto-create distributor if not exists
            user = bot.get_user(user_id)
            if user:
                self.distributors[user_id] = Distributor(user)
        return self.distributors.get(user_id)
    
    def get_all_distributors(self) -> List['Distributor']:
        return list(self.distributors.values())
    
    def monthly_reset(self):
        for distributor in self.distributors.values():
            distributor.monthly_reset()
        self.current_month = datetime.now().month

db = Database()

class Distributor:
    def __init__(self, user: discord.User):
        self.user = user
        self.sales = 0
        self.poc_earned = 0
        
    def add_sale(self, quantity: int = 1) -> None:
        """Record sales with no limits"""
        self.sales += quantity
        self.poc_earned += 100 * quantity
    
    @property
    def rank(self) -> str:
        """Automatic rank based on sales"""
        if self.sales >= 11:
            return "Platinum"
        elif self.sales >= 7:
            return "Gold"
        elif self.sales >= 4:
            return "Silver"
        elif self.sales >= 1:
            return "Bronze"
        return "Unranked"
    
    def monthly_reset(self):
        """Reset monthly stats"""
        self.sales = 0
        self.poc_earned = 0

# Background task for monthly reset
@tasks.loop(hours=24)
async def monthly_reset_check():
    now = datetime.now()
    if now.day == 1 and now.hour == 0:  # Reset on the 1st of each month at midnight
        db.monthly_reset()
        channel = bot.get_channel(YOUR_ANNOUNCEMENT_CHANNEL_ID)
        if channel:
            await channel.send("🔄 Monthly leaderboard has been reset! Everyone starts fresh!")

# Bot events
@bot.event
async def on_ready():
    print(f'Logged in as {bot.user.name}')
    try:
        synced = await bot.tree.sync()
        print(f"Synced {len(synced)} commands")
    except Exception as e:
        print(f"Error syncing commands: {e}")
    monthly_reset_check.start()

@bot.event
async def on_member_join(member: discord.Member):
    """Auto-create distributor when someone joins"""
    db.get_distributor(member.id)

# Slash commands
@bot.tree.command(name="record", description="Record sales for yourself or others")
@app_commands.describe(quantity="Number of sales to record", user="User to record for (admin only)")
async def record_sale(interaction: discord.Interaction, quantity: int = 1, user: discord.User = None):
    """Record sales with optional quantity"""
    target = user if user else interaction.user
    
    # Permission check if recording for others
    if user and not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message(
            "❌ Only admins can record sales for others",
            ephemeral=True
        )
        return
    
    distributor = db.get_distributor(target.id)
    if not distributor:
        await interaction.response.send_message(
            "❌ User not found in the system",
            ephemeral=True
        )
        return
    
    distributor.add_sale(quantity)
    
    if user:
        msg = f"✅ Recorded {quantity} sale(s) for {target.name}. They now have {distributor.sales} sales."
    else:
        msg = f"✅ Recorded {quantity} sale(s). You now have {distributor.sales} sales."
    
    await interaction.response.send_message(msg, ephemeral=not bool(user))

@bot.tree.command(name="stats", description="View your sales stats or another user's")
async def stats(interaction: discord.Interaction, user: discord.User = None):
    """View sales statistics"""
    target = user if user else interaction.user
    distributor = db.get_distributor(target.id)
    
    if not distributor:
        await interaction.response.send_message(
            f"❌ {target.name} has no sales recorded yet",
            ephemeral=not bool(user)
        )
        return
    
    embed = discord.Embed(
        title=f"{target.name}'s Sales Stats",
        color=discord.Color.blue()
    )
    embed.add_field(name="Current Rank", value=distributor.rank, inline=True)
    embed.add_field(name="Total Sales", value=str(distributor.sales), inline=True)
    embed.add_field(name="PoC Earned", value=f"{distributor.poc_earned} PoC", inline=True)
    
    rank_emoji = {
        "Unranked": "⚪",
        "Bronze": "🟤",
        "Silver": "⚪",
        "Gold": "🟡",
        "Platinum": "🔘"
    }.get(distributor.rank, "")
    
    embed.set_thumbnail(url=target.display_avatar.url)
    embed.set_footer(text=f"{rank_emoji} {distributor.rank} Rank")
    
    await interaction.response.send_message(embed=embed, ephemeral=not bool(user))

@bot.tree.command(name="leaderboard", description="Show the current sales leaderboard")
async def leaderboard(interaction: discord.Interaction):
    """Display the current leaderboard"""
    distributors = sorted(
        [d for d in db.get_all_distributors() if d.sales > 0],
        key=lambda d: (-d.sales, -d.poc_earned)
    )[:10]  # Top 10
    
    if not distributors:
        await interaction.response.send_message("No sales recorded yet this month.")
        return
    
    embed = discord.Embed(
        title=f"Sales Leaderboard - {datetime.now().strftime('%B %Y')}",
        color=discord.Color.gold()
    )
    
    rank_colors = {
        "Platinum": 0xE5E4E2,
        "Gold": 0xFFD700,
        "Silver": 0xC0C0C0,
        "Bronze": 0xCD7F32
    }
    
    for idx, dist in enumerate(distributors, 1):
        medal = ""
        if idx == 1: medal = "🥇"
        elif idx == 2: medal = "🥈"
        elif idx == 3: medal = "🥉"
        
        embed.add_field(
            name=f"{medal} {idx}. {dist.user.name}",
            value=(
                f"Sales: {dist.sales} | PoC: {dist.poc_earned}\n"
                f"Rank: {dist.rank}"
            ),
            inline=False
        )
    
    # Set color based on top rank
    if distributors:
        top_rank = distributors[0].rank
        embed.color = rank_colors.get(top_rank, 0x000000)
    
    await interaction.response.send_message(embed=embed)

@bot.tree.command(name="reward", description="Give PoC reward to a user")
@app_commands.describe(user="User to reward", amount="Amount of PoC to give")
@app_commands.checks.has_permissions(administrator=True)
async def reward(interaction: discord.Interaction, user: discord.User, amount: int):
    """Admin command to give PoC rewards"""
    distributor = db.get_distributor(user.id)
    if not distributor:
        await interaction.response.send_message("User not found", ephemeral=True)
        return
    
    distributor.poc_earned += amount
    await interaction.response.send_message(
        f"✅ Gave {amount} PoC to {user.name}. Their total is now {distributor.poc_earned} PoC.",
        ephemeral=True
    )

# Run the bot
bot.run(MTM1OTAzOTA5Nzk2MzgwNjg5MQ.GkAkaM.8JWCRqUtO2ue-5Fe1fqVMAVlUIjJyPBy3t1eSs)  # Replace with your bot token
