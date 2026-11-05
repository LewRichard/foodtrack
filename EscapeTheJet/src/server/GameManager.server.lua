--[[
	ESCAPE THE JET - Game Manager (server)

	Round flow:
	  1. Intermission in the floating lobby
	  2. Up to 12 players are teleported into the xóm: 1 random JET, the rest INNOCENT
	  3. Hide phase: the Jet is frozen + blinded while everyone hides
	  4. Hunt: the Jet gets a knife. One gun is hidden at a random spot.
	     The first innocent to touch it becomes the POLICE (Công An).
	  5. Round ends when:
	       - the Jet catches every innocent          -> JET WINS
	       - the Police shoots the Jet               -> INNOCENTS WIN
	       - time runs out with innocents alive      -> INNOCENTS WIN
	       - the Jet leaves the game                 -> INNOCENTS WIN
	  Caught players lose and go back to the lobby to spectate.
	  If the Police dies, the gun drops where they fell so someone else can grab it.
	  If the Police shoots an innocent, both of them go down.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Debris = game:GetService("Debris")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local MapBuilder = require(script.Parent:WaitForChild("MapBuilder"))
local Weapons = require(script.Parent:WaitForChild("Weapons"))

local ROLES = Config.ROLES
local RED = Color3.fromRGB(255, 80, 80)
local BLUE = Color3.fromRGB(90, 160, 255)
local GREEN = Color3.fromRGB(90, 220, 120)
local YELLOW = Color3.fromRGB(255, 220, 90)

Players.RespawnTime = 4

---------------------------------------------------------------------------
-- Remotes + replicated game state
---------------------------------------------------------------------------
local remotes = Instance.new("Folder")
remotes.Name = "Remotes"
local gameEvent = Instance.new("RemoteEvent")
gameEvent.Name = "GameEvent"
gameEvent.Parent = remotes
local shootGun = Instance.new("RemoteEvent")
shootGun.Name = "ShootGun"
shootGun.Parent = remotes
remotes.Parent = ReplicatedStorage

local stateFolder = Instance.new("Folder")
stateFolder.Name = "GameState"
local function newValue(className: string, name: string, value: any)
	local v = Instance.new(className)
	v.Name = name;
	(v :: any).Value = value
	v.Parent = stateFolder
	return v
end
local statusValue = newValue("StringValue", "Status", "Đang chờ người chơi...") :: StringValue
local timeValue = newValue("IntValue", "TimeLeft", 0) :: IntValue
local phaseValue = newValue("StringValue", "Phase", "Waiting") :: StringValue -- Waiting/Intermission/Hiding/Playing/Ended
local aliveValue = newValue("IntValue", "InnocentsLeft", 0) :: IntValue
stateFolder.Parent = ReplicatedStorage

---------------------------------------------------------------------------
-- World
---------------------------------------------------------------------------
MapBuilder.SetupLighting()
MapBuilder.BuildLobby()
local mapInfo = MapBuilder.BuildMap()
print(string.format("[EscapeTheJet] Map built: %d gun spots, %d spawn points", #mapInfo.GunSpawns, #mapInfo.InnocentSpawns))

---------------------------------------------------------------------------
-- Players / leaderstats
---------------------------------------------------------------------------
local function onPlayerAdded(player: Player)
	local ls = Instance.new("Folder")
	ls.Name = "leaderstats"
	local wins = Instance.new("IntValue")
	wins.Name = "Wins"
	wins.Parent = ls
	ls.Parent = player
	player:SetAttribute("Role", "Lobby")
end
Players.PlayerAdded:Connect(onPlayerAdded)
for _, p in ipairs(Players:GetPlayers()) do
	onPlayerAdded(p)
end

---------------------------------------------------------------------------
-- Round state
---------------------------------------------------------------------------
type RoundState = {
	active: boolean,
	participants: { Player },
	alive: { [Player]: boolean },
	jet: Player?,
	police: Player?,
	result: string?,
	gunPickup: Model?,
	connections: { RBXScriptConnection },
	deathReason: { [Player]: string },
}

local function emptyRound(): RoundState
	return {
		active = false,
		participants = {},
		alive = {},
		jet = nil,
		police = nil,
		result = nil,
		gunPickup = nil,
		connections = {},
		deathReason = {},
	}
end

local round: RoundState = emptyRound()

local function getHumanoid(player: Player): (Humanoid?, Model?)
	local char = player.Character
	if not char then
		return nil, nil
	end
	local hum = char:FindFirstChildOfClass("Humanoid")
	if hum and hum.Health > 0 then
		return hum, char
	end
	return nil, nil
end

local function broadcast(msg: string, color: Color3?)
	gameEvent:FireAllClients("Message", msg, color or Color3.new(1, 1, 1))
end

local function countInnocents(): number
	local n = 0
	for p in pairs(round.alive) do
		if p ~= round.jet then
			n += 1
		end
	end
	return n
end

local function updateAliveCount()
	aliveValue.Value = countInnocents()
	if round.active and phaseValue.Value ~= "Ended" and round.jet and countInnocents() == 0 then
		round.result = round.result or "JetWins"
	end
end

local function playSound(parent: Instance?, id: string?)
	if parent and id and id ~= "" then
		local s = Instance.new("Sound")
		s.SoundId = id
		s.Volume = 0.8
		s.RollOffMaxDistance = 120
		s.Parent = parent
		s:Play()
		Debris:AddItem(s, 4)
	end
end

local function shuffle<T>(t: { T }): { T }
	for i = #t, 2, -1 do
		local j = math.random(i)
		t[i], t[j] = t[j], t[i]
	end
	return t
end

local function randomGunSpot(): Vector3
	return mapInfo.GunSpawns[math.random(#mapInfo.GunSpawns)]
end

---------------------------------------------------------------------------
-- Gun pickup / Police
---------------------------------------------------------------------------
local spawnGunPickup -- forward declaration

local function makePolice(player: Player)
	local hum, char = getHumanoid(player)
	if not hum or not char then
		return false
	end
	player:SetAttribute("Role", ROLES.Police)
	round.police = player
	hum.WalkSpeed = Config.POLICE_SPEED
	local gun = Weapons.CreateGun()
	gun.Parent = player:FindFirstChildOfClass("Backpack")
	hum:EquipTool(gun)
	Weapons.AddPoliceHat(char)
	playSound(char:FindFirstChild("HumanoidRootPart"), Config.SOUNDS.GunPickup)
	broadcast("👮 " .. player.DisplayName .. " đã tìm thấy khẩu súng và trở thành CÔNG AN!", BLUE)
	gameEvent:FireClient(player, "Role", ROLES.Police)
	return true
end

spawnGunPickup = function(position: Vector3)
	if round.gunPickup then
		round.gunPickup:Destroy()
		round.gunPickup = nil
	end
	local model, hitbox = Weapons.CreateGunPickup(position, Workspace)
	round.gunPickup = model
	local taken = false
	hitbox.Touched:Connect(function(hit)
		if taken or not round.active or phaseValue.Value ~= "Playing" then
			return
		end
		local character = hit:FindFirstAncestorOfClass("Model")
		local player = character and Players:GetPlayerFromCharacter(character)
		if not player or not round.alive[player] then
			return
		end
		if player:GetAttribute("Role") ~= ROLES.Innocent then
			return -- the Jet cannot take the gun
		end
		taken = true
		if makePolice(player) then
			model:Destroy()
			if round.gunPickup == model then
				round.gunPickup = nil
			end
		else
			taken = false
		end
	end)
end

---------------------------------------------------------------------------
-- Deaths
---------------------------------------------------------------------------
local function onParticipantDied(player: Player)
	if not round.active or not round.alive[player] then
		return
	end
	round.alive[player] = nil
	local reason = round.deathReason[player] or "other"
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	local deathPos = root and root.Position

	if player == round.jet then
		if reason == "police" then
			round.result = round.result or "PoliceWin"
		else
			round.result = round.result or "JetLeft"
		end
		return
	end

	player:SetAttribute("Role", "Out")

	if player == round.police then
		round.police = nil
		if phaseValue.Value == "Playing" then
			local dropAt = deathPos and (deathPos - Vector3.new(0, 2.5, 0)) or randomGunSpot()
			if dropAt.Y < -5 or dropAt.Y > 60 then
				dropAt = randomGunSpot()
			end
			spawnGunPickup(dropAt)
			broadcast("🔫 Công An đã gục! Khẩu súng rơi xuống đất – ai nhặt được sẽ thành Công An mới!", YELLOW)
		end
	end

	if reason == "jet" then
		broadcast("🔪 " .. player.DisplayName .. " đã bị JET bắt!", RED)
		gameEvent:FireClient(player, "Caught", "Bạn đã bị JET bắt! BẠN THUA.\nYou were caught by the Jet!")
	elseif reason == "friendlyfire" then
		broadcast("💥 " .. player.DisplayName .. " bị Công An bắn nhầm!", YELLOW)
		gameEvent:FireClient(player, "Caught", "Bạn bị Công An bắn nhầm!\nThe Police shot you by mistake.")
	elseif reason == "penalty" then
		broadcast("⚠️ " .. player.DisplayName .. " bắn nhầm người vô tội và đã gục!", YELLOW)
		gameEvent:FireClient(player, "Caught", "Bạn đã bắn nhầm người vô tội!\nYou shot an innocent and went down too.")
	else
		broadcast("💀 " .. player.DisplayName .. " đã bị loại!", RED)
		gameEvent:FireClient(player, "Caught", "Bạn đã bị loại! BẠN THUA.")
	end
	updateAliveCount()
end

local function killPlayer(player: Player, reason: string)
	local hum = getHumanoid(player)
	if hum then
		round.deathReason[player] = reason
		hum.Health = 0
	end
end

---------------------------------------------------------------------------
-- Jet's knife
---------------------------------------------------------------------------
local function giveKnife(player: Player)
	local hum = getHumanoid(player)
	if not hum then
		return
	end
	local knife = Weapons.CreateKnife()
	local lastSwing = 0

	knife.Activated:Connect(function()
		if not round.active or phaseValue.Value ~= "Playing" then
			return
		end
		if player ~= round.jet or not round.alive[player] then
			return
		end
		local now = os.clock()
		if now - lastSwing < Config.KNIFE_COOLDOWN then
			return
		end
		lastSwing = now

		local _, char = getHumanoid(player)
		local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
		if not root then
			return
		end

		-- swing animation (default Animate script plays "Slash" for a toolanim value)
		local anim = Instance.new("StringValue")
		anim.Name = "toolanim"
		anim.Value = "Slash"
		anim.Parent = knife
		Debris:AddItem(anim, 1)
		playSound(knife:FindFirstChild("Handle"), Config.SOUNDS.KnifeSlash)

		for target in pairs(round.alive) do
			if target ~= player then
				local tchar = target.Character
				local troot = tchar and tchar:FindFirstChild("HumanoidRootPart") :: BasePart?
				if troot and (troot.Position - root.Position).Magnitude <= Config.KNIFE_RANGE then
					killPlayer(target, "jet")
				end
			end
		end
	end)

	knife.Parent = player:FindFirstChildOfClass("Backpack")
	hum:EquipTool(knife)
end

---------------------------------------------------------------------------
-- Police gun (client sends the aim point, server validates + raycasts)
---------------------------------------------------------------------------
local lastShot: { [Player]: number } = {}

shootGun.OnServerEvent:Connect(function(player: Player, targetPos: any)
	if typeof(targetPos) ~= "Vector3" then
		return
	end
	if not round.active or phaseValue.Value ~= "Playing" then
		return
	end
	if player ~= round.police or not round.alive[player] then
		return
	end
	local hum, char = getHumanoid(player)
	if not hum or not char then
		return
	end
	local gun = char:FindFirstChild("Gun")
	if not gun or not gun:IsA("Tool") then
		return -- gun must be equipped
	end
	local now = os.clock()
	if lastShot[player] and now - lastShot[player] < Config.GUN_COOLDOWN then
		return
	end
	lastShot[player] = now

	local handle = gun:FindFirstChild("Handle") :: BasePart?
	local head = char:FindFirstChild("Head") :: BasePart?
	local origin = (handle and handle.Position) or (head and head.Position)
	if not origin then
		return
	end
	local dir = targetPos - origin
	if dir.Magnitude < 0.1 then
		return
	end
	dir = dir.Unit * Config.GUN_RANGE

	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { char }
	local result = Workspace:Raycast(origin, dir, params)
	local hitPos = result and result.Position or (origin + dir)

	Weapons.Tracer(origin, hitPos)
	playSound(handle, Config.SOUNDS.GunShot)

	if not result then
		return
	end
	local model = result.Instance:FindFirstAncestorOfClass("Model")
	local victim = model and Players:GetPlayerFromCharacter(model)
	if not victim or not round.alive[victim] then
		return
	end

	if victim == round.jet then
		round.result = round.result or "PoliceWin"
		killPlayer(victim, "police")
		broadcast("🎯 " .. player.DisplayName .. " đã bắn hạ JET!", BLUE)
	else
		killPlayer(victim, "friendlyfire")
		killPlayer(player, "penalty")
	end
end)

---------------------------------------------------------------------------
-- Leaving mid-round
---------------------------------------------------------------------------
Players.PlayerRemoving:Connect(function(player)
	lastShot[player] = nil
	if not round.active or not round.alive[player] then
		return
	end
	round.alive[player] = nil
	if player == round.jet then
		round.result = round.result or "JetLeft"
		return
	end
	if player == round.police then
		round.police = nil
		if phaseValue.Value == "Playing" then
			spawnGunPickup(randomGunSpot())
			broadcast("Công An đã rời game – khẩu súng lại được giấu đâu đó!", YELLOW)
		end
	end
	updateAliveCount()
end)

---------------------------------------------------------------------------
-- Round flow
---------------------------------------------------------------------------
local function waitOrResult(seconds: number)
	local t = 0
	while t < seconds and not round.result do
		t += task.wait(0.1)
	end
end

local function cleanupRound(sendHome: boolean)
	for _, c in ipairs(round.connections) do
		c:Disconnect()
	end
	if round.gunPickup then
		round.gunPickup:Destroy()
	end
	local participants = round.participants
	round = emptyRound()
	for _, p in ipairs(Players:GetPlayers()) do
		p:SetAttribute("Role", "Lobby")
	end
	if sendHome then
		for _, p in ipairs(participants) do
			if p.Parent == Players then
				p:LoadCharacter() -- respawn in the lobby, which clears tools + looks
			end
		end
	end
	timeValue.Value = 0
	aliveValue.Value = 0
end

local function endRound(result: string)
	phaseValue.Value = "Ended"
	local title, color
	local winners: { Player } = {}

	local function addSurvivors()
		for p in pairs(round.alive) do
			if p ~= round.jet then
				table.insert(winners, p)
			end
		end
	end

	if result == "JetWins" then
		title, color = "JET ĐÃ THẮNG! Cả xóm đã bị bắt.\nThe Jet caught everyone!", RED
		if round.jet then
			table.insert(winners, round.jet)
		end
	elseif result == "PoliceWin" then
		title, color = "CÔNG AN ĐÃ HẠ JET! Người vô tội thắng!\nThe Police took down the Jet!", BLUE
		addSurvivors()
	elseif result == "JetLeft" then
		title, color = "JET ĐÃ BỎ CHẠY! Người vô tội thắng!\nThe Jet ran away!", GREEN
		addSurvivors()
	else
		title, color = "HẾT GIỜ! Người vô tội đã sống sót!\nTime's up – innocents survive!", GREEN
		addSurvivors()
	end

	local names = {}
	for _, p in ipairs(winners) do
		if p.Parent == Players then
			local ls = p:FindFirstChild("leaderstats")
			local wins = ls and ls:FindFirstChild("Wins") :: IntValue?
			if wins then
				wins.Value += 1
			end
			table.insert(names, p.DisplayName)
		end
	end

	statusValue.Value = (title:split("\n"))[1]
	timeValue.Value = 0
	gameEvent:FireAllClients("RoundEnd", title, color, table.concat(names, ", "))

	-- stop counting deaths as round events while we wait
	round.active = false
	task.wait(Config.END_SCREEN_TIME)
	cleanupRound(true)
end

local function setupParticipant(player: Player, role: string, spawnPos: Vector3): boolean
	local hum, char = getHumanoid(player)
	if not hum or not char then
		return false
	end
	-- clear anything left in the backpack
	local backpack = player:FindFirstChildOfClass("Backpack")
	if backpack then
		backpack:ClearAllChildren()
	end
	char:PivotTo(CFrame.new(spawnPos + Vector3.new(0, 3.5, 0)))
	player:SetAttribute("Role", role)
	hum.WalkSpeed = role == ROLES.Jet and Config.JET_SPEED or Config.INNOCENT_SPEED
	round.alive[player] = true
	table.insert(round.connections, hum.Died:Connect(function()
		onParticipantDied(player)
	end))
	return true
end

local function runRound()
	local candidates: { Player } = {}
	for _, p in ipairs(Players:GetPlayers()) do
		if getHumanoid(p) then
			table.insert(candidates, p)
		end
	end
	if #candidates < Config.MIN_PLAYERS then
		return
	end
	shuffle(candidates)
	while #candidates > Config.MAX_PLAYERS do
		table.remove(candidates)
	end

	round = emptyRound()
	round.active = true
	round.participants = candidates
	local jet = candidates[1]
	round.jet = jet

	-- Jet
	if not setupParticipant(jet, ROLES.Jet, mapInfo.JetSpawn) then
		cleanupRound(false)
		return
	end
	Weapons.AddJetLook(jet.Character)

	-- Innocents
	local spawns = shuffle(table.clone(mapInfo.InnocentSpawns))
	for i = 2, #candidates do
		setupParticipant(candidates[i], ROLES.Innocent, spawns[(i - 2) % #spawns + 1])
	end
	for p in pairs(round.alive) do
		gameEvent:FireClient(p, "Role", p:GetAttribute("Role"))
	end
	updateAliveCount()

	-- Hide phase: freeze + blind the Jet
	phaseValue.Value = "Hiding"
	local jetChar = jet.Character
	local jetRoot = jetChar and jetChar:FindFirstChild("HumanoidRootPart") :: BasePart?
	if jetRoot then
		jetRoot.Anchored = true
	end
	gameEvent:FireClient(jet, "Blind", Config.HIDE_TIME)
	broadcast("😈 " .. jet.DisplayName .. " là JET! Chạy đi trốn mau!", RED)

	for t = Config.HIDE_TIME, 1, -1 do
		if round.result then
			break
		end
		timeValue.Value = t
		statusValue.Value = "JET sẽ đi tìm sau " .. t .. "s – Đi trốn mau!"
		waitOrResult(1)
	end
	if jetRoot and jetRoot.Parent then
		jetRoot.Anchored = false
	end

	-- Hunt phase
	if not round.result then
		phaseValue.Value = "Playing"
		giveKnife(jet)
		spawnGunPickup(randomGunSpot())
		broadcast("🔪 JET đang đi săn! Có 1 khẩu súng được giấu đâu đó trong xóm...", YELLOW)

		for t = Config.ROUND_TIME, 1, -1 do
			if round.result then
				break
			end
			timeValue.Value = t
			statusValue.Value = string.format("Còn %d người vô tội • %d:%02d", countInnocents(), t // 60, t % 60)
			waitOrResult(1)
		end
	end

	endRound(round.result or "TimeUp")
end

---------------------------------------------------------------------------
-- Main loop
---------------------------------------------------------------------------
while true do
	phaseValue.Value = "Waiting"
	while #Players:GetPlayers() < Config.MIN_PLAYERS do
		statusValue.Value = string.format("Cần ít nhất %d người chơi (%d/%d)", Config.MIN_PLAYERS, #Players:GetPlayers(), Config.MIN_PLAYERS)
		timeValue.Value = 0
		task.wait(1)
	end

	phaseValue.Value = "Intermission"
	local enough = true
	for t = Config.INTERMISSION_TIME, 1, -1 do
		if #Players:GetPlayers() < Config.MIN_PLAYERS then
			enough = false
			break
		end
		timeValue.Value = t
		statusValue.Value = "Ván mới bắt đầu sau " .. t .. "s"
		task.wait(1)
	end

	if enough then
		local ok, err = pcall(runRound)
		if not ok then
			warn("[EscapeTheJet] Round error: " .. tostring(err))
			cleanupRound(true)
		end
	end
	task.wait(1)
end
