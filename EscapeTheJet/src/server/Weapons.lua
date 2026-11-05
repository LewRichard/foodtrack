--[[
	Weapons: builds the Jet's knife, the Police gun, the hidden gun pickup,
	bullet tracers and the role "looks" (Jet bandana, Police cap).
	Everything is created from code so the game works without any uploaded assets.
]]

local Debris = game:GetService("Debris")
local Workspace = game:GetService("Workspace")

local Weapons = {}

local function weld(a: BasePart, b: BasePart)
	local w = Instance.new("WeldConstraint")
	w.Part0 = a
	w.Part1 = b
	w.Parent = a
end

local function toolPart(props): Part
	local p = Instance.new("Part")
	p.CanCollide = false
	p.Massless = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	if props.Shape then
		p.Shape = props.Shape
	end
	for k, v in pairs(props) do
		if k ~= "Parent" and k ~= "Shape" then
			(p :: any)[k] = v
		end
	end
	p.Parent = props.Parent
	return p
end

---------------------------------------------------------------------------
-- Jet's knife (dao)
---------------------------------------------------------------------------
function Weapons.CreateKnife(): Tool
	local tool = Instance.new("Tool")
	tool.Name = "Knife"
	tool.ToolTip = "Dao của Jet - click để chém"
	tool.CanBeDropped = false
	tool.RequiresHandle = true

	local handle = toolPart({
		Name = "Handle",
		Size = Vector3.new(0.3, 0.35, 1.2),
		Color = Color3.fromRGB(55, 32, 18),
		Material = Enum.Material.Wood,
		Parent = tool,
	})

	local guard = toolPart({
		Name = "Guard",
		Size = Vector3.new(0.35, 0.8, 0.15),
		Color = Color3.fromRGB(40, 40, 45),
		Material = Enum.Material.Metal,
		CFrame = handle.CFrame * CFrame.new(0, 0, 0.65),
		Parent = tool,
	})
	weld(handle, guard)

	local blade = toolPart({
		Name = "Blade",
		Size = Vector3.new(0.08, 0.45, 2),
		Color = Color3.fromRGB(205, 210, 220),
		Material = Enum.Material.Metal,
		Reflectance = 0.35,
		CFrame = handle.CFrame * CFrame.new(0, 0.05, 1.7),
		Parent = tool,
	})
	weld(handle, blade)

	tool.Grip = CFrame.new(0, 0, 0)
	return tool
end

---------------------------------------------------------------------------
-- Police gun (súng)
---------------------------------------------------------------------------
local function buildGunParts(parent: Instance, base: CFrame, anchored: boolean): Part
	local body = toolPart({
		Name = anchored and "GunBody" or "Handle",
		Size = Vector3.new(0.35, 0.55, 1.7),
		Color = Color3.fromRGB(30, 30, 34),
		Material = Enum.Material.Metal,
		CFrame = base,
		Anchored = anchored,
		Parent = parent,
	})
	local grip = toolPart({
		Name = "Grip",
		Size = Vector3.new(0.32, 1, 0.45),
		Color = Color3.fromRGB(70, 45, 25),
		Material = Enum.Material.Wood,
		CFrame = base * CFrame.new(0, -0.65, -0.5) * CFrame.Angles(math.rad(15), 0, 0),
		Anchored = anchored,
		Parent = parent,
	})
	local barrel = toolPart({
		Name = "Barrel",
		Size = Vector3.new(0.2, 0.2, 0.6),
		Color = Color3.fromRGB(15, 15, 18),
		Material = Enum.Material.Metal,
		CFrame = base * CFrame.new(0, 0.1, 1.1),
		Anchored = anchored,
		Parent = parent,
	})
	local star = toolPart({
		Name = "Star",
		Size = Vector3.new(0.37, 0.2, 0.2),
		Color = Color3.fromRGB(255, 205, 40),
		Material = Enum.Material.Neon,
		CFrame = base * CFrame.new(0, 0, -0.3),
		Anchored = anchored,
		Parent = parent,
	})
	if not anchored then
		weld(body, grip)
		weld(body, barrel)
		weld(body, star)
	end
	return body
end

function Weapons.CreateGun(): Tool
	local tool = Instance.new("Tool")
	tool.Name = "Gun"
	tool.ToolTip = "Súng Công An - click để bắn"
	tool.CanBeDropped = false
	tool.RequiresHandle = true
	buildGunParts(tool, CFrame.new(), false)
	tool.Grip = CFrame.new(0, -0.4, -0.5)
	return tool
end

-- The glowing gun hidden somewhere in the map. Returns the Model and its hitbox.
function Weapons.CreateGunPickup(position: Vector3, parent: Instance): (Model, BasePart)
	local model = Instance.new("Model")
	model.Name = "HiddenGun"

	local center = position + Vector3.new(0, 1.6, 0)

	local hitbox = Instance.new("Part")
	hitbox.Name = "Hitbox"
	hitbox.Size = Vector3.new(4, 5, 4)
	hitbox.Transparency = 1
	hitbox.Anchored = true
	hitbox.CanCollide = false
	hitbox.CanQuery = false
	hitbox.CFrame = CFrame.new(center)
	hitbox.Parent = model
	model.PrimaryPart = hitbox

	local body = buildGunParts(model, CFrame.new(center), true)
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") then
			d.CanCollide = false
			d.CanQuery = false
		end
	end

	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(255, 210, 90)
	light.Range = 7
	light.Brightness = 2
	light.Parent = body

	model.Parent = parent

	-- spin + bob
	task.spawn(function()
		local t = 0
		while model.Parent do
			t += 1 / 30
			model:PivotTo(CFrame.new(center + Vector3.new(0, math.sin(t * 2) * 0.3, 0)) * CFrame.Angles(0, t * 2, 0))
			task.wait(1 / 30)
		end
	end)

	return model, hitbox
end

function Weapons.Tracer(from: Vector3, to: Vector3)
	local dist = (to - from).Magnitude
	if dist < 0.05 then
		return
	end
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Material = Enum.Material.Neon
	p.Color = Color3.fromRGB(255, 230, 120)
	p.Size = Vector3.new(0.15, 0.15, dist)
	p.CFrame = CFrame.lookAt(from, to) * CFrame.new(0, 0, -dist / 2)
	p.Parent = Workspace
	Debris:AddItem(p, 0.12)
end

---------------------------------------------------------------------------
-- Role looks
---------------------------------------------------------------------------
local function addBillboard(head: BasePart, text: string, color: Color3)
	local bb = Instance.new("BillboardGui")
	bb.Name = "RoleTag"
	bb.Size = UDim2.fromOffset(120, 36)
	bb.StudsOffset = Vector3.new(0, 2.6, 0)
	bb.MaxDistance = 120
	bb.AlwaysOnTop = false
	bb.Adornee = head
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = text
	label.TextColor3 = color
	label.TextStrokeTransparency = 0
	label.TextScaled = true
	label.Font = Enum.Font.GothamBlack
	label.Parent = bb
	bb.Parent = head
end

function Weapons.AddJetLook(character: Model?)
	if not character then
		return
	end
	local head = character:FindFirstChild("Head") :: BasePart?
	if not head then
		return
	end
	-- red bandana
	local bandana = toolPart({
		Name = "JetBandana",
		Size = Vector3.new(head.Size.X + 0.1, 0.35, head.Size.Z + 0.1),
		Color = Color3.fromRGB(200, 25, 30),
		Material = Enum.Material.Fabric,
		CFrame = head.CFrame * CFrame.new(0, head.Size.Y * 0.28, 0),
		Parent = character,
	})
	weld(head, bandana)
	local knot = toolPart({
		Name = "JetBandanaKnot",
		Size = Vector3.new(0.3, 0.6, 0.15),
		Color = Color3.fromRGB(200, 25, 30),
		Material = Enum.Material.Fabric,
		CFrame = head.CFrame * CFrame.new(0, head.Size.Y * 0.15, head.Size.Z / 2 + 0.1) * CFrame.Angles(math.rad(20), 0, 0),
		Parent = character,
	})
	weld(head, knot)
	-- dark sunglasses
	local glasses = toolPart({
		Name = "JetGlasses",
		Size = Vector3.new(head.Size.X * 0.85, 0.25, 0.1),
		Color = Color3.fromRGB(10, 10, 10),
		Material = Enum.Material.Glass,
		Reflectance = 0.4,
		CFrame = head.CFrame * CFrame.new(0, head.Size.Y * 0.08, -head.Size.Z / 2 - 0.05),
		Parent = character,
	})
	weld(head, glasses)
	addBillboard(head, "JET", Color3.fromRGB(255, 60, 60))
end

function Weapons.AddPoliceHat(character: Model?)
	if not character then
		return
	end
	local head = character:FindFirstChild("Head") :: BasePart?
	if not head or character:FindFirstChild("PoliceCap") then
		return
	end
	local cap = toolPart({
		Name = "PoliceCap",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.5, head.Size.X + 0.2, head.Size.X + 0.2),
		Color = Color3.fromRGB(40, 70, 40), -- Vietnamese police olive-green
		Material = Enum.Material.Fabric,
		CFrame = head.CFrame * CFrame.new(0, head.Size.Y * 0.55, 0) * CFrame.Angles(0, 0, math.rad(90)),
		Parent = character,
	})
	weld(head, cap)
	local badge = toolPart({
		Name = "PoliceBadge",
		Size = Vector3.new(0.35, 0.35, 0.1),
		Color = Color3.fromRGB(255, 200, 40),
		Material = Enum.Material.Neon,
		CFrame = head.CFrame * CFrame.new(0, head.Size.Y * 0.55, -head.Size.Z / 2 - 0.12),
		Parent = character,
	})
	weld(head, badge)
end

return Weapons
