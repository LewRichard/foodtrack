--[[
	ESCAPE THE JET - client HUD
	  • status bar + timer + innocents left
	  • role reveal card, role badge
	  • Jet blindfold during the hide phase
	  • kill feed / messages, "you were caught" and round-end screens
	  • Police gun aiming (sends the mouse/tap position to the server)
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local mouse = player:GetMouse()

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))
local remotes = ReplicatedStorage:WaitForChild("Remotes")
local gameEvent = remotes:WaitForChild("GameEvent") :: RemoteEvent
local shootGun = remotes:WaitForChild("ShootGun") :: RemoteEvent
local state = ReplicatedStorage:WaitForChild("GameState")
local statusValue = state:WaitForChild("Status") :: StringValue
local timeValue = state:WaitForChild("TimeLeft") :: IntValue
local phaseValue = state:WaitForChild("Phase") :: StringValue
local aliveValue = state:WaitForChild("InnocentsLeft") :: IntValue

---------------------------------------------------------------------------
-- UI helpers
---------------------------------------------------------------------------
local function make(className: string, props: { [string]: any }, children: { Instance }?): any
	local inst = Instance.new(className)
	for k, v in pairs(props) do
		if k ~= "Parent" then
			(inst :: any)[k] = v
		end
	end
	if children then
		for _, c in ipairs(children) do
			c.Parent = inst
		end
	end
	inst.Parent = props.Parent
	return inst
end

local function corner(r: number)
	return make("UICorner", { CornerRadius = UDim.new(0, r) })
end

local function stroke(color: Color3, thickness: number)
	return make("UIStroke", { Color = color, Thickness = thickness, ApplyStrokeMode = Enum.ApplyStrokeMode.Border })
end

local gui = make("ScreenGui", {
	Name = "EscapeTheJetHUD",
	ResetOnSpawn = false,
	IgnoreGuiInset = true,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	Parent = player:WaitForChild("PlayerGui"),
})

---------------------------------------------------------------------------
-- Top status bar
---------------------------------------------------------------------------
local topBar = make("Frame", {
	Name = "TopBar",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 56),
	Size = UDim2.new(0, 520, 0, 70),
	BackgroundColor3 = Color3.fromRGB(20, 18, 24),
	BackgroundTransparency = 0.2,
	Parent = gui,
}, { corner(12), stroke(Color3.fromRGB(255, 70, 70), 2), make("UISizeConstraint", { MaxSize = Vector2.new(520, 70) }) })
topBar.Size = UDim2.new(0.9, 0, 0, 70)

make("TextLabel", {
	Name = "Title",
	BackgroundTransparency = 1,
	Position = UDim2.new(0, 12, 0, 4),
	Size = UDim2.new(1, -24, 0, 22),
	Font = Enum.Font.GothamBlack,
	Text = "ESCAPE THE JET",
	TextColor3 = Color3.fromRGB(255, 80, 80),
	TextScaled = true,
	Parent = topBar,
})

local statusLabel = make("TextLabel", {
	Name = "Status",
	BackgroundTransparency = 1,
	Position = UDim2.new(0, 12, 0, 28),
	Size = UDim2.new(1, -110, 0, 34),
	Font = Enum.Font.GothamBold,
	Text = statusValue.Value,
	TextColor3 = Color3.new(1, 1, 1),
	TextScaled = true,
	TextXAlignment = Enum.TextXAlignment.Left,
	Parent = topBar,
})

local timerLabel = make("TextLabel", {
	Name = "Timer",
	BackgroundTransparency = 1,
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, -12, 0, 26),
	Size = UDim2.new(0, 90, 0, 38),
	Font = Enum.Font.GothamBlack,
	Text = "",
	TextColor3 = Color3.fromRGB(255, 220, 90),
	TextScaled = true,
	TextXAlignment = Enum.TextXAlignment.Right,
	Parent = topBar,
})

local function refreshTop()
	statusLabel.Text = statusValue.Value
	local t = timeValue.Value
	timerLabel.Text = t > 0 and string.format("%d:%02d", t // 60, t % 60) or ""
end
statusValue.Changed:Connect(refreshTop)
timeValue.Changed:Connect(refreshTop)
refreshTop()

---------------------------------------------------------------------------
-- Role badge (bottom-left)
---------------------------------------------------------------------------
local badge = make("Frame", {
	Name = "RoleBadge",
	AnchorPoint = Vector2.new(0, 1),
	Position = UDim2.new(0, 16, 1, -16),
	Size = UDim2.new(0, 230, 0, 64),
	BackgroundColor3 = Color3.fromRGB(20, 18, 24),
	BackgroundTransparency = 0.2,
	Visible = false,
	Parent = gui,
}, { corner(10) })
local badgeStroke = stroke(Color3.new(1, 1, 1), 2)
badgeStroke.Parent = badge
local badgeRole = make("TextLabel", {
	BackgroundTransparency = 1,
	Position = UDim2.new(0, 10, 0, 4),
	Size = UDim2.new(1, -20, 0, 32),
	Font = Enum.Font.GothamBlack,
	TextScaled = true,
	TextXAlignment = Enum.TextXAlignment.Left,
	Text = "",
	Parent = badge,
})
local badgeAlive = make("TextLabel", {
	BackgroundTransparency = 1,
	Position = UDim2.new(0, 10, 0, 36),
	Size = UDim2.new(1, -20, 0, 22),
	Font = Enum.Font.GothamBold,
	TextScaled = true,
	TextXAlignment = Enum.TextXAlignment.Left,
	TextColor3 = Color3.fromRGB(220, 220, 220),
	Text = "",
	Parent = badge,
})

local function refreshBadge()
	local role = player:GetAttribute("Role")
	local info = role and Config.ROLE_INFO[role]
	local inRound = phaseValue.Value == "Hiding" or phaseValue.Value == "Playing"
	if info then
		badge.Visible = true
		badgeRole.Text = info.Title
		badgeRole.TextColor3 = info.Color
		badgeStroke.Color = info.Color
	elseif role == "Out" and inRound then
		badge.Visible = true
		badgeRole.Text = "ĐÃ BỊ LOẠI"
		badgeRole.TextColor3 = Color3.fromRGB(160, 160, 160)
		badgeStroke.Color = Color3.fromRGB(160, 160, 160)
	else
		badge.Visible = false
	end
	badgeAlive.Text = inRound and ("Người vô tội còn lại: " .. aliveValue.Value) or ""
end
player:GetAttributeChangedSignal("Role"):Connect(refreshBadge)
aliveValue.Changed:Connect(refreshBadge)
phaseValue.Changed:Connect(refreshBadge)
refreshBadge()

---------------------------------------------------------------------------
-- Message feed
---------------------------------------------------------------------------
local feed = make("Frame", {
	Name = "Feed",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 136),
	Size = UDim2.new(0.9, 0, 0, 150),
	BackgroundTransparency = 1,
	Parent = gui,
}, {
	make("UIListLayout", { Padding = UDim.new(0, 4), HorizontalAlignment = Enum.HorizontalAlignment.Center, SortOrder = Enum.SortOrder.LayoutOrder }),
	make("UISizeConstraint", { MaxSize = Vector2.new(620, 150) }),
})
local msgOrder = 0

local function pushMessage(text: string, color: Color3?)
	msgOrder += 1
	local label = make("TextLabel", {
		LayoutOrder = msgOrder,
		Size = UDim2.new(1, 0, 0, 26),
		BackgroundColor3 = Color3.fromRGB(10, 10, 14),
		BackgroundTransparency = 0.35,
		Font = Enum.Font.GothamBold,
		Text = text,
		TextColor3 = color or Color3.new(1, 1, 1),
		TextScaled = true,
		Parent = feed,
	}, { corner(6), make("UIPadding", { PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8) }) })
	-- keep only the 5 newest
	local labels = {}
	for _, c in ipairs(feed:GetChildren()) do
		if c:IsA("TextLabel") then
			table.insert(labels, c)
		end
	end
	table.sort(labels, function(a, b)
		return a.LayoutOrder < b.LayoutOrder
	end)
	while #labels > 5 do
		table.remove(labels, 1):Destroy()
	end
	task.delay(6, function()
		if label.Parent then
			local tween = TweenService:Create(label, TweenInfo.new(0.6), { TextTransparency = 1, BackgroundTransparency = 1 })
			tween:Play()
			tween.Completed:Wait()
			label:Destroy()
		end
	end)
end

---------------------------------------------------------------------------
-- Big center card (role reveal / caught / round end)
---------------------------------------------------------------------------
local card = make("Frame", {
	Name = "Card",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.45),
	Size = UDim2.new(0.85, 0, 0, 210),
	BackgroundColor3 = Color3.fromRGB(15, 12, 18),
	BackgroundTransparency = 0.1,
	Visible = false,
	ZIndex = 5,
	Parent = gui,
}, { corner(16), make("UISizeConstraint", { MaxSize = Vector2.new(640, 210) }) })
local cardStroke = stroke(Color3.new(1, 1, 1), 3)
cardStroke.Parent = card
local cardTitle = make("TextLabel", {
	BackgroundTransparency = 1,
	Position = UDim2.new(0, 16, 0, 14),
	Size = UDim2.new(1, -32, 0, 70),
	Font = Enum.Font.GothamBlack,
	TextScaled = true,
	Text = "",
	ZIndex = 6,
	Parent = card,
})
local cardDesc = make("TextLabel", {
	BackgroundTransparency = 1,
	Position = UDim2.new(0, 16, 0, 92),
	Size = UDim2.new(1, -32, 0, 104),
	Font = Enum.Font.GothamMedium,
	TextScaled = true,
	TextWrapped = true,
	TextColor3 = Color3.fromRGB(235, 235, 235),
	Text = "",
	ZIndex = 6,
	Parent = card,
})
local cardToken = 0

local function showCard(title: string, desc: string, color: Color3, duration: number)
	cardToken += 1
	local my = cardToken
	cardTitle.Text = title
	cardTitle.TextColor3 = color
	cardStroke.Color = color
	cardDesc.Text = desc
	card.Visible = true
	card.Size = UDim2.new(0.6, 0, 0, 150)
	TweenService:Create(card, TweenInfo.new(0.35, Enum.EasingStyle.Back), { Size = UDim2.new(0.85, 0, 0, 210) }):Play()
	task.delay(duration, function()
		if cardToken == my then
			card.Visible = false
		end
	end)
end

---------------------------------------------------------------------------
-- Jet blindfold
---------------------------------------------------------------------------
local blind = make("Frame", {
	Name = "Blindfold",
	Size = UDim2.fromScale(1, 1),
	BackgroundColor3 = Color3.new(0, 0, 0),
	Visible = false,
	ZIndex = 10,
	Parent = gui,
})
local blindText = make("TextLabel", {
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.5),
	Size = UDim2.new(0.8, 0, 0, 140),
	BackgroundTransparency = 1,
	Font = Enum.Font.GothamBlack,
	TextScaled = true,
	TextColor3 = Color3.fromRGB(255, 70, 70),
	Text = "",
	ZIndex = 11,
	Parent = blind,
})

local function startBlind(seconds: number)
	blind.Visible = true
	blind.BackgroundTransparency = 0
	for t = seconds, 1, -1 do
		blindText.Text = "BẠN LÀ JET 😈\nNhắm mắt đếm... " .. t .. "\nCả xóm đang đi trốn!"
		task.wait(1)
		if phaseValue.Value ~= "Hiding" then
			break
		end
	end
	blindText.Text = "ĐI SĂN THÔI!"
	TweenService:Create(blind, TweenInfo.new(0.8), { BackgroundTransparency = 1 }):Play()
	task.wait(0.8)
	blind.Visible = false
end

phaseValue.Changed:Connect(function(phase)
	if phase ~= "Hiding" and phase ~= "Playing" then
		blind.Visible = false
	end
end)

---------------------------------------------------------------------------
-- Server events
---------------------------------------------------------------------------
gameEvent.OnClientEvent:Connect(function(kind: string, a: any, b: any, c: any)
	if kind == "Message" then
		pushMessage(a, b)
	elseif kind == "Role" then
		local info = Config.ROLE_INFO[a]
		if info then
			showCard(info.Title, info.Desc, info.Color, 5)
		end
		refreshBadge()
	elseif kind == "Blind" then
		task.spawn(startBlind, a)
	elseif kind == "Caught" then
		showCard("BẠN THUA!", a, Color3.fromRGB(255, 70, 70), 5)
	elseif kind == "RoundEnd" then
		local desc = (c and c ~= "") and ("Người thắng / Winners:\n" .. c) or "Không ai thắng ván này."
		showCard(a, desc, b, Config.END_SCREEN_TIME)
	end
end)

---------------------------------------------------------------------------
-- Police gun aiming
---------------------------------------------------------------------------
local hooked = setmetatable({}, { __mode = "k" })

local function hookTool(tool: Instance)
	if not tool:IsA("Tool") or tool.Name ~= "Gun" or hooked[tool] then
		return
	end
	hooked[tool] = true
	tool.Equipped:Connect(function()
		mouse.Icon = "rbxasset://textures/GunCursor.png"
	end)
	tool.Unequipped:Connect(function()
		mouse.Icon = ""
	end)
	tool.Activated:Connect(function()
		shootGun:FireServer(mouse.Hit.Position)
	end)
end

local function watchContainer(container: Instance)
	for _, c in ipairs(container:GetChildren()) do
		hookTool(c)
	end
	container.ChildAdded:Connect(hookTool)
end

player.CharacterAdded:Connect(function(char)
	mouse.Icon = ""
	watchContainer(char)
	watchContainer(player:WaitForChild("Backpack"))
end)
if player.Character then
	watchContainer(player.Character)
	local bp = player:FindFirstChild("Backpack")
	if bp then
		watchContainer(bp)
	end
end
