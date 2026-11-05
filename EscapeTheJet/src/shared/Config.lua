--[[
	Escape The Jet - shared configuration
	"Jet" = Vietnamese slang for a troublemaking street youth who hangs out,
	picks fights and street-races. Here the Jet hunts everyone in the xóm (neighbourhood).
]]

local Config = {}

Config.GAME_NAME = "Escape The Jet"

-- Players
Config.MAX_PLAYERS = 12 -- 1 Jet + 11 innocents (also set Max Players = 12 in your place settings)
Config.MIN_PLAYERS = 2 -- lowest number needed to start a round (handy for testing)

-- Timings (seconds)
Config.INTERMISSION_TIME = 20
Config.HIDE_TIME = 15 -- Jet is frozen + blinded while innocents hide
Config.ROUND_TIME = 180
Config.END_SCREEN_TIME = 7

-- Movement
Config.JET_SPEED = 17
Config.INNOCENT_SPEED = 16
Config.POLICE_SPEED = 16

-- Weapons
Config.KNIFE_RANGE = 7
Config.KNIFE_COOLDOWN = 0.8
Config.GUN_RANGE = 400
Config.GUN_COOLDOWN = 2.5

-- World
Config.LOBBY_HEIGHT = 160

Config.ROLES = {
	Jet = "Jet",
	Innocent = "Innocent",
	Police = "Police",
}

Config.ROLE_INFO = {
	Jet = {
		Title = "BẠN LÀ JET",
		Color = Color3.fromRGB(235, 55, 55),
		Desc = "Dùng dao bắt hết mọi người trong xóm!\nCatch everyone with your knife. Watch out for the Police!",
	},
	Innocent = {
		Title = "NGƯỜI VÔ TỘI",
		Color = Color3.fromRGB(80, 210, 110),
		Desc = "Trốn khỏi Jet! Tìm khẩu súng giấu trong xóm để thành Công An.\nHide from the Jet and find the hidden gun!",
	},
	Police = {
		Title = "CÔNG AN (POLICE)",
		Color = Color3.fromRGB(70, 140, 255),
		Desc = "Bắn hạ Jet để cứu cả xóm! Bắn nhầm người vô tội là bạn cũng gục.\nShoot the Jet. Don't shoot innocents!",
	},
}

-- Sound ids. Leave a string empty to disable that sound.
-- Paste your own audio ids (e.g. "rbxassetid://123456") for a gunshot etc.
Config.SOUNDS = {
	KnifeSlash = "rbxasset://sounds/swordslash.wav",
	GunShot = "",
	GunPickup = "rbxasset://sounds/electronicpingshort.wav",
}

return Config
