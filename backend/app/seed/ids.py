"""Stable ids for the demo world (ARCHITECTURE.md 15.1).

Every seed module and every lane's demo code refers to the cast and key places
by these constants, so the three seed modules line up without importing each
other. Add ids here; never rename one.
"""

# --- Users: the demo cast -----------------------------------------------------
ANISH = "u_anish"  # main demo phone
TONY = "u_tony"
MAYA = "u_maya"
PRIYA = "u_priya"
DEV = "u_dev"
DHIVYESH = "u_dhivyesh"
JORDAN = "u_jordan"  # not Anish's friend; hosts the open pickleball Move
MOM = "u_mom"  # Anish's friend, in no Circle, on his hidden-from list
HS_SAM = "u_hs_sam"
HS_RILEY = "u_hs_riley"
HS_KAI = "u_hs_kai"
# Jordan's pickleball crew ("Jordan + 3")
CASEY = "u_casey"
MORGAN = "u_morgan"
TAYLOR = "u_taylor"

HS_FRIENDS = (HS_SAM, HS_RILEY, HS_KAI)
PICKLEBALL_CREW = (CASEY, MORGAN, TAYLOR)
CAST = (
    ANISH,
    TONY,
    MAYA,
    PRIYA,
    DEV,
    DHIVYESH,
    JORDAN,
    MOM,
    *HS_FRIENDS,
    *PICKLEBALL_CREW,
)

# --- Anish's Circles ----------------------------------------------------------
CIRCLE_ROOMMATES = "c_roommates"
CIRCLE_CLIMBING = "c_climbing"  # tagged as a Facebook Group
CIRCLE_HS_FRIENDS = "c_hs_friends"
CIRCLE_STUDY_GROUP = "c_study_group"

# --- Key Marks ----------------------------------------------------------------
KUMO_MATCHA = "mk_kumo_matcha"  # Tony's live Move; geotagged Reel
FAT_STRAWS = "mk_fat_straws"  # boba; glasses demo
CHIPOTLE = "mk_chipotle"  # Anish + Tony + Maya lunch spot
CLIMBING_GYM = "mk_climbing_gym"  # the fading Thursday climbing crew
PICKLEBALL_COURT = "mk_pickleball_court"  # Jordan's open Move
FOUNDERS_HALL = "mk_founders_hall"  # study spot
LAST_NIGHT_SPOT = "mk_last_night_spot"  # ghosts + seeded Moments from last night
HACKER_SQUARE = "mk_hacker_square"  # campus courtyard (Priya's walk)
QUIET_CAFE = "mk_quiet_cafe"  # Reel at a Mark with nobody there
CAPTION_CAFE = "mk_caption_cafe"  # Reel with no geotag; caption names it
# The other three matcha spots Anish and Priya hit this month (history).
MATCHA_LEAF_WHISK = "mk_leaf_whisk"
MATCHA_MAIKO = "mk_maiko_matcha"
MATCHA_GREENROOM = "mk_greenroom_tea"
HS_HANGOUT = "mk_in_n_out"  # the HS friends' Saturday spot (history)
STANFORD_DISH = "mk_stanford_dish"  # Maya's hike Reel

# --- Live Moves ---------------------------------------------------------------
MOVE_TONY_KUMO = "mv_tony_kumo"
MOVE_JORDAN_PICKLEBALL = "mv_jordan_pickleball"
MOVE_LAST_NIGHT = "mv_last_night"  # ended; source of the ghosts
MOVE_DEV_MPK21 = "mv_dev_mpk21"  # live study Move on the Meta campus
MOVE_PRIYA_SQUARE = "mv_priya_square"  # live walk, just started, nobody yet

# --- Reels --------------------------------------------------------------------
REEL_KUMO = "rl_kumo"  # geotagged at Kumo: friends-there path
REEL_NOBODY = "rl_nobody"  # Mark with nobody there: start-a-Move path
REEL_CAPTION = "rl_caption"  # no geotag: resolver demo
REEL_EXTRA = "rl_extra"

# --- History (ended Moves, 8 weeks back) -------------------------------------
HISTORY_MOVE_PREFIX = "mv_hist_"  # mv_hist_00, mv_hist_01, ... oldest first
FIRST_HISTORY_MOVE = f"{HISTORY_MOVE_PREFIX}00"
