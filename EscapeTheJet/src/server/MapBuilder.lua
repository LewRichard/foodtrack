--[[
	MapBuilder: procedurally builds a Vietnamese "xóm" (local neighbourhood):

	  • Main street (đường) with asphalt, red-tile sidewalks, crosswalk and a "Khu Phố Văn Hóa" arch
	  • Rows of narrow pastel tube houses (nhà ống) with open shop fronts, balconies,
	    roll-down shutters, shop signs and horizontal inox water tanks on the roofs
	  • Concrete power poles with the famous tangled electric wires
	  • Parked motorbikes (xe máy), plastic-stool street food (quán cóc), bánh mì carts
	  • Narrow alleys (hẻm) with red lanterns, trash bins and laundry
	  • A wet market (chợ xóm) behind the north row
	  • A park with a lake, a giant banyan tree (cây đa) and a small shrine (miếu) behind the south row
	  • A floating rooftop-café lobby

	BuildMap() returns { JetSpawn, InnocentSpawns, GunSpawns }.
]]

local Lighting = game:GetService("Lighting")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))

local MapBuilder = {}

local rng = Random.new(2412)
local rgb = Color3.fromRGB

---------------------------------------------------------------------------
-- Palette
---------------------------------------------------------------------------
local COLORS = {
	asphalt = rgb(48, 48, 54),
	sidewalk = rgb(176, 96, 78),
	concrete = rgb(165, 160, 150),
	wetConcrete = rgb(120, 118, 112),
	grass = rgb(90, 150, 70),
	water = rgb(60, 130, 140),
	wood = rgb(120, 80, 45),
	metal = rgb(150, 155, 160),
	inox = rgb(205, 210, 215),
	shutter = rgb(130, 135, 140),
	glass = rgb(40, 70, 90),
	tire = rgb(25, 25, 25),
	lantern = rgb(230, 30, 30),
	gold = rgb(240, 190, 60),
}

local HOUSE_COLORS = {
	rgb(245, 214, 120), -- vàng (yellow)
	rgb(170, 220, 200), -- mint
	rgb(240, 180, 190), -- hồng (pink)
	rgb(150, 190, 230), -- xanh (blue)
	rgb(250, 240, 225), -- cream
	rgb(240, 160, 100), -- cam (orange)
	rgb(200, 230, 150), -- lime
	rgb(220, 200, 240), -- lavender
}

local SHOP_NAMES = {
	"PHỞ BÒ", "BÁNH MÌ", "CÀ PHÊ", "TẠP HÓA", "SỬA XE", "KARAOKE",
	"TRÀ SỮA", "CƠM TẤM", "BÚN CHẢ", "HỦ TIẾU", "TIỆM VÀNG", "NHÀ THUỐC",
	"GỘI ĐẦU", "NET CỎ", "BIA HƠI", "ỐC LUỘC", "BÚN BÒ", "TIỆM MAY",
}

local PLASTIC = { rgb(220, 40, 40), rgb(40, 90, 210), rgb(240, 200, 30), rgb(30, 160, 80) }
local BIKE_COLORS = { rgb(200, 30, 30), rgb(25, 25, 30), rgb(235, 235, 235), rgb(40, 80, 200), rgb(230, 110, 160), rgb(90, 90, 95) }
local TARP_COLORS = { rgb(40, 90, 200), rgb(220, 50, 40), rgb(40, 160, 90), rgb(240, 150, 30), rgb(200, 60, 160) }
local FRUIT_COLORS = { rgb(250, 200, 40), rgb(230, 60, 130), rgb(70, 160, 60), rgb(240, 120, 30), rgb(200, 30, 40), rgb(150, 90, 40) }

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------
local function part(props): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Material = Enum.Material.SmoothPlastic
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

local function cyl(props): Part
	props.Shape = Enum.PartType.Cylinder
	return part(props)
end

local function ball(props): Part
	props.Shape = Enum.PartType.Ball
	return part(props)
end

-- vertical cylinder standing on `bottom`
local function vcyl(bottom: Vector3, height: number, diameter: number, props): Part
	props.Shape = Enum.PartType.Cylinder
	props.Size = Vector3.new(height, diameter, diameter)
	props.CFrame = CFrame.new(bottom + Vector3.new(0, height / 2, 0)) * CFrame.Angles(0, 0, math.rad(90))
	return part(props)
end

local function beam(p1: Vector3, p2: Vector3, thickness: number, color: Color3, parent: Instance, collide: boolean?): Part
	local dist = (p2 - p1).Magnitude
	return part({
		Size = Vector3.new(thickness, thickness, dist),
		CFrame = CFrame.lookAt((p1 + p2) / 2, p2),
		Color = color,
		CanCollide = collide == true,
		CanQuery = collide == true,
		Parent = parent,
	})
end

-- sagging electric wire
local function wire(p1: Vector3, p2: Vector3, sag: number, parent: Instance)
	local prev = p1
	local segments = 4
	for i = 1, segments do
		local t = i / segments
		local pt = p1:Lerp(p2, t) - Vector3.new(0, sag * 4 * t * (1 - t), 0)
		beam(prev, pt, 0.12, rgb(20, 20, 20), parent, false)
		prev = pt
	end
end

local function pick(t)
	return t[rng:NextInteger(1, #t)]
end

local function newModel(name: string, parent: Instance): Model
	local m = Instance.new("Model")
	m.Name = name
	m.Parent = parent
	return m
end

local function folder(name: string, parent: Instance): Folder
	local f = Instance.new("Folder")
	f.Name = name
	f.Parent = parent
	return f
end

local function sign(target: BasePart, face: Enum.NormalId, text: string, textColor: Color3, font: Enum.Font?)
	local gui = Instance.new("SurfaceGui")
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 40
	gui.LightInfluence = 0.3
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = text
	label.TextColor3 = textColor
	label.TextScaled = true
	label.TextWrapped = true
	label.Font = font or Enum.Font.BuilderSansExtraBold
	label.TextStrokeTransparency = 0.6
	label.Parent = gui
	gui.Parent = target
	return label
end

---------------------------------------------------------------------------
-- Props
---------------------------------------------------------------------------
local function motorbike(parent: Instance, pos: Vector3, yaw: number, color: Color3?)
	local m = newModel("XeMay", parent)
	local base = CFrame.new(pos) * CFrame.Angles(0, yaw, 0)
	local c = color or pick(BIKE_COLORS)
	local function at(x, y, z)
		return base * CFrame.new(x, y, z)
	end
	part({ Name = "Body", Size = Vector3.new(1.1, 1.3, 3.2), CFrame = at(0, 1.6, 0.1), Color = c, Parent = m })
	part({ Name = "Seat", Size = Vector3.new(1, 0.35, 1.9), CFrame = at(0, 2.4, 0.5), Color = rgb(30, 25, 25), Parent = m })
	part({ Name = "Fork", Size = Vector3.new(0.25, 2.3, 0.25), CFrame = at(0, 1.8, -1.75) * CFrame.Angles(math.rad(-20), 0, 0), Color = COLORS.metal, Material = Enum.Material.Metal, Parent = m })
	part({ Name = "Front", Size = Vector3.new(1, 1.4, 0.6), CFrame = at(0, 2.3, -1.9), Color = c, Parent = m })
	part({ Name = "Handlebar", Size = Vector3.new(2.2, 0.18, 0.18), CFrame = at(0, 3.05, -2.05), Color = rgb(30, 30, 30), Parent = m })
	part({ Name = "Headlight", Size = Vector3.new(0.6, 0.45, 0.2), CFrame = at(0, 2.5, -2.25), Color = rgb(255, 245, 210), Material = Enum.Material.Neon, Parent = m })
	part({ Name = "Taillight", Size = Vector3.new(0.5, 0.25, 0.15), CFrame = at(0, 2.2, 1.75), Color = rgb(255, 40, 40), Material = Enum.Material.Neon, Parent = m })
	part({ Name = "Exhaust", Size = Vector3.new(0.3, 0.3, 1.4), CFrame = at(0.6, 0.9, 1.1), Color = COLORS.inox, Material = Enum.Material.Metal, Parent = m })
	local plate = part({ Name = "Plate", Size = Vector3.new(0.9, 0.5, 0.08), CFrame = at(0, 1.5, 1.8), Color = rgb(245, 245, 245), Parent = m })
	sign(plate, Enum.NormalId.Back, "59-" .. rng:NextInteger(100, 999), rgb(20, 20, 20))
	cyl({ Name = "FrontWheel", Size = Vector3.new(0.45, 1.8, 1.8), CFrame = at(0, 0.9, -1.9), Color = COLORS.tire, Parent = m })
	cyl({ Name = "RearWheel", Size = Vector3.new(0.45, 1.8, 1.8), CFrame = at(0, 0.9, 1.5), Color = COLORS.tire, Parent = m })
	return m
end

local function plasticStool(parent: Instance, pos: Vector3, color: Color3?)
	local c = color or pick(PLASTIC)
	part({ Name = "GheNhua", Size = Vector3.new(0.9, 1.1, 0.9), CFrame = CFrame.new(pos + Vector3.new(0, 0.55, 0)), Color = c, Parent = parent })
	part({ Name = "GheNhuaSeat", Size = Vector3.new(1.2, 0.2, 1.2), CFrame = CFrame.new(pos + Vector3.new(0, 1.2, 0)), Color = c, Parent = parent })
end

local function foodSet(parent: Instance, pos: Vector3, withUmbrella: boolean)
	local m = newModel("QuanCoc", parent)
	local tableColor = pick({ rgb(240, 240, 235), rgb(60, 110, 200), rgb(220, 60, 50) })
	part({ Name = "TableLeg", Size = Vector3.new(0.4, 1.9, 0.4), CFrame = CFrame.new(pos + Vector3.new(0, 0.95, 0)), Color = COLORS.metal, Parent = m })
	part({ Name = "TableTop", Size = Vector3.new(2.8, 0.2, 2.8), CFrame = CFrame.new(pos + Vector3.new(0, 2, 0)), Color = tableColor, Parent = m })
	vcyl(pos + Vector3.new(0.5, 2.1, 0.4), 0.5, 0.9, { Name = "Bowl", Color = rgb(250, 250, 250), Parent = m })
	vcyl(pos + Vector3.new(-0.6, 2.1, -0.3), 0.8, 0.35, { Name = "Glass", Color = rgb(150, 90, 40), Transparency = 0.2, Parent = m })
	local stoolColor = pick(PLASTIC)
	for _, off in ipairs({ Vector3.new(2, 0, 0), Vector3.new(-2, 0, 0), Vector3.new(0, 0, 2), Vector3.new(0, 0, -2) }) do
		if rng:NextNumber() < 0.85 then
			plasticStool(m, pos + off, stoolColor)
		end
	end
	if withUmbrella then
		vcyl(pos + Vector3.new(0, 2.1, 0), 6, 0.2, { Name = "UmbrellaPole", Color = COLORS.metal, Parent = m })
		local canopy = vcyl(pos + Vector3.new(0, 8, 0), 0.3, 9, { Name = "Umbrella", Color = pick(TARP_COLORS), Material = Enum.Material.Fabric, Parent = m })
		canopy.CanCollide = false
	end
	return m
end

local function banhMiCart(parent: Instance, pos: Vector3, yaw: number)
	local m = newModel("XeBanhMi", parent)
	local base = CFrame.new(pos) * CFrame.Angles(0, yaw, 0)
	part({ Name = "Cart", Size = Vector3.new(5, 2.6, 2.5), CFrame = base * CFrame.new(0, 2.3, 0), Color = rgb(240, 240, 240), Parent = m })
	part({ Name = "GlassCase", Size = Vector3.new(4.6, 1.8, 2.1), CFrame = base * CFrame.new(0, 4.5, 0), Color = rgb(200, 230, 255), Material = Enum.Material.Glass, Transparency = 0.5, Parent = m })
	for i = -1, 1 do
		part({ Name = "Bread", Size = Vector3.new(1.2, 0.4, 0.5), CFrame = base * CFrame.new(i * 1.4, 3.9, 0), Color = rgb(215, 160, 80), Parent = m })
	end
	local board = part({ Name = "Sign", Size = Vector3.new(4.6, 1, 0.2), CFrame = base * CFrame.new(0, 5.9, -1.2), Color = rgb(220, 30, 30), Parent = m })
	sign(board, Enum.NormalId.Front, "BÁNH MÌ 15K", rgb(255, 230, 80))
	cyl({ Name = "Wheel1", Size = Vector3.new(0.4, 1.8, 1.8), CFrame = base * CFrame.new(2.6, 0.9, 0) * CFrame.Angles(0, math.rad(90), 0), Color = COLORS.tire, Parent = m })
	cyl({ Name = "Wheel2", Size = Vector3.new(0.4, 1.8, 1.8), CFrame = base * CFrame.new(-2.6, 0.9, 0) * CFrame.Angles(0, math.rad(90), 0), Color = COLORS.tire, Parent = m })
	return m
end

local function lantern(parent: Instance, pos: Vector3, withLight: boolean)
	local l = ball({ Name = "DenLong", Size = Vector3.new(1.4, 1.4, 1.4), CFrame = CFrame.new(pos), Color = COLORS.lantern, Material = Enum.Material.Neon, CanCollide = false, CanQuery = false, Parent = parent })
	part({ Name = "Cap", Size = Vector3.new(0.7, 0.2, 0.7), CFrame = CFrame.new(pos + Vector3.new(0, 0.75, 0)), Color = COLORS.gold, CanCollide = false, CanQuery = false, Parent = parent })
	part({ Name = "Tassel", Size = Vector3.new(0.15, 0.7, 0.15), CFrame = CFrame.new(pos - Vector3.new(0, 1, 0)), Color = COLORS.gold, CanCollide = false, CanQuery = false, Parent = parent })
	if withLight then
		local light = Instance.new("PointLight")
		light.Color = rgb(255, 90, 60)
		light.Range = 12
		light.Brightness = 1.2
		light.Parent = l
	end
end

local function trashBin(parent: Instance, pos: Vector3)
	local c = pick({ rgb(30, 110, 60), rgb(40, 90, 200), rgb(240, 130, 20) })
	part({ Name = "ThungRac", Size = Vector3.new(2.4, 3.6, 2.4), CFrame = CFrame.new(pos + Vector3.new(0, 1.8, 0)), Color = c, Parent = parent })
	part({ Name = "Lid", Size = Vector3.new(2.6, 0.3, 2.6), CFrame = CFrame.new(pos + Vector3.new(0, 3.75, 0)), Color = c, Parent = parent })
end

local function bush(parent: Instance, pos: Vector3, size: number)
	for _ = 1, 4 do
		local s = size * rng:NextNumber(0.6, 1)
		local off = Vector3.new(rng:NextNumber(-size / 3, size / 3), s / 2, rng:NextNumber(-size / 3, size / 3))
		ball({ Name = "Bush", Size = Vector3.new(s, s, s), CFrame = CFrame.new(pos + off), Color = rgb(50, rng:NextInteger(110, 150), 50), Material = Enum.Material.Grass, Parent = parent })
	end
end

---------------------------------------------------------------------------
-- Tube house (nhà ống)
---------------------------------------------------------------------------
-- side = 1 : north row, front at z = 18 facing the street (-Z)
-- side = -1: south row, front at z = -18 facing the street (+Z)
local function tubeHouse(parent: Instance, cx: number, side: number, index: number, gunSpawns: { Vector3 })
	local m = newModel("NhaOng_" .. index, parent)
	local width = 10
	local depth = 22
	local frontZ = 18 * side
	local backZ = 40 * side
	local midZ = (frontZ + backZ) / 2
	local out = -side -- direction from facade toward the street
	local frontFace = side == 1 and Enum.NormalId.Front or Enum.NormalId.Back
	local floors = rng:NextInteger(3, 5)
	local groundH = 10
	local floorH = 9
	local totalH = groundH + (floors - 1) * floorH
	local color = pick(HOUSE_COLORS)
	local isOpen = rng:NextNumber() < 0.7

	-- upper body (solid)
	part({ Name = "Upper", Size = Vector3.new(width, totalH - groundH, depth), CFrame = CFrame.new(cx, groundH + (totalH - groundH) / 2, midZ), Color = color, Material = Enum.Material.Concrete, Parent = m })
	-- ground floor shell
	part({ Name = "Floor", Size = Vector3.new(width, 0.2, depth), CFrame = CFrame.new(cx, 0.7, midZ), Color = pick({ rgb(230, 225, 215), rgb(200, 170, 150), rgb(220, 220, 230) }), Material = Enum.Material.Marble, Parent = m })
	part({ Name = "BackWall", Size = Vector3.new(width, groundH, 1), CFrame = CFrame.new(cx, groundH / 2, backZ - side * 0.5), Color = color, Material = Enum.Material.Concrete, Parent = m })
	part({ Name = "WallL", Size = Vector3.new(1, groundH, depth), CFrame = CFrame.new(cx - width / 2 + 0.5, groundH / 2, midZ), Color = color, Material = Enum.Material.Concrete, Parent = m })
	part({ Name = "WallR", Size = Vector3.new(1, groundH, depth), CFrame = CFrame.new(cx + width / 2 - 0.5, groundH / 2, midZ), Color = color, Material = Enum.Material.Concrete, Parent = m })

	-- shop sign above the entrance
	local shopName = pick(SHOP_NAMES)
	local signBoard = part({ Name = "BienHieu", Size = Vector3.new(width - 0.4, 2.4, 0.4), CFrame = CFrame.new(cx, groundH - 1.2, frontZ + out * 0.2), Color = pick({ rgb(200, 25, 30), rgb(20, 70, 160), rgb(250, 210, 40), rgb(30, 130, 70) }), Parent = m })
	sign(signBoard, frontFace, shopName, rgb(255, 255, 255))

	-- striped awning
	part({
		Name = "MaiHien",
		Size = Vector3.new(width - 0.4, 0.2, 3.5),
		CFrame = CFrame.new(cx, groundH - 2.9, frontZ + out * 1.7) * CFrame.Angles(-side * math.rad(15), 0, 0),
		Color = pick(TARP_COLORS),
		Material = Enum.Material.Fabric,
		CanCollide = false,
		Parent = m,
	})

	if isOpen then
		-- interior: counter, shelves, light
		part({ Name = "Counter", Size = Vector3.new(4.5, 3.5, 1.5), CFrame = CFrame.new(cx - 1.75, 0.8 + 1.75, frontZ + side * 12), Color = rgb(160, 110, 70), Material = Enum.Material.Wood, Parent = m })
		part({ Name = "Shelf", Size = Vector3.new(width - 2, 6, 1.2), CFrame = CFrame.new(cx, 0.8 + 3, backZ - side * 1.6), Color = rgb(110, 75, 45), Material = Enum.Material.Wood, Parent = m })
		for i = 1, 8 do
			local bx = cx - 3.5 + (i - 1)
			local by = 0.8 + (i % 2 == 0 and 4.5 or 2.5)
			part({ Name = "Goods", Size = Vector3.new(0.8, 0.9, 0.6), CFrame = CFrame.new(bx, by, backZ - side * 2.4), Color = pick(FRUIT_COLORS), Parent = m })
		end
		local lamp = part({ Name = "Lamp", Size = Vector3.new(4, 0.2, 0.4), CFrame = CFrame.new(cx, groundH - 0.1, midZ), Color = rgb(255, 250, 230), Material = Enum.Material.Neon, CanCollide = false, Parent = m })
		local light = Instance.new("PointLight")
		light.Range = 14
		light.Brightness = 0.8
		light.Parent = lamp
		plasticStool(m, Vector3.new(cx + 2, 0.8, frontZ + side * 6))
		-- hiding spot behind the counter
		table.insert(gunSpawns, Vector3.new(cx - 2, 0.8, frontZ + side * 14.5))
	else
		-- closed roll-down shutter (cửa cuốn)
		part({ Name = "CuaCuon", Size = Vector3.new(width - 2, groundH - 2.4, 0.4), CFrame = CFrame.new(cx, (groundH - 2.4) / 2, frontZ + side * 0.5), Color = COLORS.shutter, Material = Enum.Material.DiamondPlate, Parent = m })
	end

	-- upper floors: windows, balconies, plants, laundry
	for f = 1, floors - 1 do
		local y = groundH + (f - 1) * floorH
		part({ Name = "Window", Size = Vector3.new(width - 4, 4.5, 0.3), CFrame = CFrame.new(cx, y + 4.5, frontZ + out * 0.15), Color = COLORS.glass, Material = Enum.Material.Glass, Transparency = 0.15, Parent = m })
		part({ Name = "Balcony", Size = Vector3.new(width - 0.6, 0.6, 3), CFrame = CFrame.new(cx, y + 0.3, frontZ + out * 1.5), Color = color, Material = Enum.Material.Concrete, Parent = m })
		part({ Name = "Rail", Size = Vector3.new(width - 0.6, 0.25, 0.25), CFrame = CFrame.new(cx, y + 3.3, frontZ + out * 2.85), Color = rgb(40, 40, 40), Material = Enum.Material.Metal, Parent = m })
		for bx = -4, 4, 1.6 do
			part({ Name = "Baluster", Size = Vector3.new(0.15, 2.7, 0.15), CFrame = CFrame.new(cx + bx, y + 1.95, frontZ + out * 2.85), Color = rgb(40, 40, 40), Material = Enum.Material.Metal, Parent = m })
		end
		if rng:NextNumber() < 0.6 then
			vcyl(Vector3.new(cx + 3.5, y + 0.6, frontZ + out * 1.4), 1, 1, { Name = "ChauCay", Color = rgb(170, 80, 50), Parent = m })
			ball({ Name = "Plant", Size = Vector3.new(1.8, 1.8, 1.8), CFrame = CFrame.new(cx + 3.5, y + 2.2, frontZ + out * 1.4), Color = rgb(60, 140, 60), Material = Enum.Material.Grass, CanCollide = false, Parent = m })
		end
		if rng:NextNumber() < 0.4 then
			-- laundry line
			beam(Vector3.new(cx - 4, y + 3, frontZ + out * 2.6), Vector3.new(cx + 2, y + 3, frontZ + out * 2.6), 0.08, rgb(240, 240, 240), m)
			for lx = -3.4, 1.6, 1.25 do
				part({ Name = "QuanAo", Size = Vector3.new(0.9, 1.3, 0.06), CFrame = CFrame.new(cx + lx, y + 2.3, frontZ + out * 2.6), Color = pick(TARP_COLORS), Material = Enum.Material.Fabric, CanCollide = false, CanQuery = false, Parent = m })
			end
		end
	end

	-- rooftop: horizontal inox water tank (bồn nước) + antenna
	local tankZ = midZ + side * rng:NextNumber(-4, 4)
	for _, lx in ipairs({ -1.5, 1.5 }) do
		part({ Name = "TankLeg", Size = Vector3.new(0.3, 1.5, 2), CFrame = CFrame.new(cx + lx, totalH + 0.75, tankZ), Color = COLORS.metal, Parent = m })
	end
	cyl({ Name = "BonNuoc", Size = Vector3.new(4.5, 3, 3), CFrame = CFrame.new(cx, totalH + 3, tankZ), Color = COLORS.inox, Material = Enum.Material.Metal, Reflectance = 0.2, Parent = m })
	if rng:NextNumber() < 0.5 then
		vcyl(Vector3.new(cx - 3, totalH, midZ - side * 6), 6, 0.2, { Name = "Antenna", Color = COLORS.metal, Parent = m })
	end
	part({ Name = "Parapet", Size = Vector3.new(width, 1.2, 0.4), CFrame = CFrame.new(cx, totalH + 0.6, frontZ + side * 0.2), Color = color, Material = Enum.Material.Concrete, Parent = m })

	return m
end

---------------------------------------------------------------------------
-- Power pole with tangled wires
---------------------------------------------------------------------------
local function powerPole(parent: Instance, base: Vector3, side: number): { Vector3 }
	local m = newModel("CotDien", parent)
	vcyl(base, 24, 0.9, { Name = "Pole", Color = rgb(150, 145, 135), Material = Enum.Material.Concrete, Parent = m })
	part({ Name = "Cross1", Size = Vector3.new(0.4, 0.4, 5), CFrame = CFrame.new(base + Vector3.new(0, 20, 0)), Color = rgb(60, 60, 60), Material = Enum.Material.Metal, Parent = m })
	part({ Name = "Cross2", Size = Vector3.new(0.4, 0.4, 4), CFrame = CFrame.new(base + Vector3.new(0, 22.5, 0)), Color = rgb(60, 60, 60), Material = Enum.Material.Metal, Parent = m })
	if rng:NextNumber() < 0.35 then
		vcyl(base + Vector3.new(0, 15, -0.9 * side), 2.4, 1.8, { Name = "BienAp", Color = rgb(110, 115, 110), Material = Enum.Material.Metal, Parent = m })
	end
	-- coil of messy wire "bird's nest"
	for _ = 1, 3 do
		local y = rng:NextNumber(13, 19)
		part({ Name = "Tangle", Size = Vector3.new(rng:NextNumber(1, 1.8), rng:NextNumber(0.6, 1.2), rng:NextNumber(1, 1.8)), CFrame = CFrame.new(base + Vector3.new(0, y, 0)) * CFrame.Angles(rng:NextNumber(0, 1), rng:NextNumber(0, 3), 0), Color = rgb(20, 20, 20), CanCollide = false, CanQuery = false, Parent = m })
	end
	-- street lamp arm pointing to the road
	part({ Name = "LampArm", Size = Vector3.new(0.3, 0.3, 4), CFrame = CFrame.new(base + Vector3.new(0, 18, -side * 2)), Color = rgb(60, 60, 60), Parent = m })
	local lamp = part({ Name = "Lamp", Size = Vector3.new(1, 0.4, 1.4), CFrame = CFrame.new(base + Vector3.new(0, 17.8, -side * 4)), Color = rgb(255, 220, 150), Material = Enum.Material.Neon, CanCollide = false, Parent = m })
	local light = Instance.new("SpotLight")
	light.Face = Enum.NormalId.Bottom
	light.Range = 26
	light.Angle = 100
	light.Brightness = 2
	light.Color = rgb(255, 210, 150)
	light.Parent = lamp

	return {
		base + Vector3.new(0, 20, -2.2),
		base + Vector3.new(0, 20, -1),
		base + Vector3.new(0, 20, 1),
		base + Vector3.new(0, 20, 2.2),
		base + Vector3.new(0, 22.5, -1.7),
		base + Vector3.new(0, 22.5, 1.7),
	}
end

---------------------------------------------------------------------------
-- Market stall (sạp chợ)
---------------------------------------------------------------------------
local MARKET_GOODS = { "TRÁI CÂY", "RAU SẠCH", "CÁ TƯƠI", "THỊT HEO", "HOA TƯƠI", "QUẦN ÁO", "BÁNH KẸO", "GIA VỊ" }

local function marketStall(parent: Instance, pos: Vector3, gunSpawns: { Vector3 })
	local m = newModel("SapCho", parent)
	local tarp = pick(TARP_COLORS)
	part({ Name = "Table", Size = Vector3.new(8, 0.4, 4), CFrame = CFrame.new(pos + Vector3.new(0, 3, 0)), Color = COLORS.wood, Material = Enum.Material.WoodPlanks, Parent = m })
	-- cloth skirt on the front so you can crouch-hide behind the table
	part({ Name = "Skirt", Size = Vector3.new(8, 2.8, 0.1), CFrame = CFrame.new(pos + Vector3.new(0, 1.4, -2)), Color = tarp, Material = Enum.Material.Fabric, Parent = m })
	for _, x in ipairs({ -3.8, 3.8 }) do
		for _, z in ipairs({ -1.8, 1.8 }) do
			part({ Name = "Leg", Size = Vector3.new(0.3, 2.8, 0.3), CFrame = CFrame.new(pos + Vector3.new(x, 1.4, z)), Color = COLORS.wood, Parent = m })
		end
	end
	for _, x in ipairs({ -4.8, 4.8 }) do
		for _, z in ipairs({ -3, 3 }) do
			vcyl(pos + Vector3.new(x, 0, z), 8, 0.3, { Name = "Pole", Color = COLORS.metal, Parent = m })
		end
	end
	local roof = part({ Name = "Tarp", Size = Vector3.new(10.5, 0.2, 7), CFrame = CFrame.new(pos + Vector3.new(0, 8.1, 0)) * CFrame.Angles(math.rad(6), 0, 0), Color = tarp, Material = Enum.Material.Fabric, Parent = m })
	roof.CanCollide = false
	for i = -1, 1 do
		local basket = pos + Vector3.new(i * 2.5, 3.2, 0)
		vcyl(basket, 0.7, 2, { Name = "Ro", Color = rgb(170, 130, 70), Material = Enum.Material.Fabric, Parent = m })
		local fc = pick(FRUIT_COLORS)
		for _ = 1, 4 do
			ball({ Name = "Fruit", Size = Vector3.new(0.6, 0.6, 0.6), CFrame = CFrame.new(basket + Vector3.new(rng:NextNumber(-0.5, 0.5), 0.9, rng:NextNumber(-0.5, 0.5))), Color = fc, CanCollide = false, Parent = m })
		end
	end
	local board = part({ Name = "Board", Size = Vector3.new(4, 1.2, 0.15), CFrame = CFrame.new(pos + Vector3.new(0, 6.5, -3.3)), Color = rgb(250, 250, 240), CanCollide = false, Parent = m })
	sign(board, Enum.NormalId.Front, pick(MARKET_GOODS), rgb(200, 30, 30))
	plasticStool(m, pos + Vector3.new(2, 0.4, 2.2))
	-- hide spot: under the table, behind the skirt
	table.insert(gunSpawns, pos + Vector3.new(-1.5, 0.4, 0))
end

---------------------------------------------------------------------------
-- Banyan tree (cây đa) + shrine (miếu)
---------------------------------------------------------------------------
local function banyanTree(parent: Instance, pos: Vector3, gunSpawns: { Vector3 })
	local m = newModel("CayDa", parent)
	local bark = rgb(95, 75, 55)
	vcyl(pos, 22, 7, { Name = "Trunk", Color = bark, Material = Enum.Material.Wood, Parent = m })
	for i = 1, 5 do
		local a = (i / 5) * math.pi * 2
		vcyl(pos + Vector3.new(math.cos(a) * 3.8, 0, math.sin(a) * 3.8), rng:NextNumber(10, 16), 2.4, { Name = "SubTrunk", Color = bark, Material = Enum.Material.Wood, Parent = m })
	end
	local hub = pos + Vector3.new(0, 17, 0)
	for i = 1, 7 do
		local a = (i / 7) * math.pi * 2 + rng:NextNumber(-0.3, 0.3)
		local tip = pos + Vector3.new(math.cos(a) * 13, rng:NextNumber(19, 23), math.sin(a) * 13)
		beam(hub, tip, 1.6, bark, m, true)
	end
	for _ = 1, 34 do
		local a = rng:NextNumber(0, math.pi * 2)
		local r = rng:NextNumber(0, 17)
		local s = rng:NextNumber(7, 12)
		ball({
			Name = "La",
			Size = Vector3.new(s, s, s),
			CFrame = CFrame.new(pos + Vector3.new(math.cos(a) * r, rng:NextNumber(21, 29), math.sin(a) * r)),
			Color = rgb(40, rng:NextInteger(95, 135), 45),
			Material = Enum.Material.Grass,
			CanCollide = false,
			CanQuery = false,
			Parent = m,
		})
	end
	-- aerial roots
	for _ = 1, 26 do
		local a = rng:NextNumber(0, math.pi * 2)
		local r = rng:NextNumber(5, 15)
		local h = rng:NextNumber(10, 19)
		local p = vcyl(pos + Vector3.new(math.cos(a) * r, 19 - h, math.sin(a) * r), h, 0.25, { Name = "Re", Color = rgb(120, 95, 70), Parent = m })
		p.CanCollide = false
		p.CanQuery = false
	end
	-- red ribbons on the trunk
	for i = 0, 2 do
		cyl({ Name = "VaiDo", Size = Vector3.new(0.4, 7.3, 7.3), CFrame = CFrame.new(pos + Vector3.new(0, 5 + i * 0.9, 0)) * CFrame.Angles(0, 0, math.rad(90)), Color = rgb(200, 20, 20), Material = Enum.Material.Fabric, Parent = m })
	end
	table.insert(gunSpawns, pos + Vector3.new(-6.5, 0.4, -2))

	-- shrine (miếu) beside the tree
	local s = newModel("Mieu", parent)
	local sp = pos + Vector3.new(9, 0, 6)
	part({ Name = "Base", Size = Vector3.new(5, 1, 5), CFrame = CFrame.new(sp + Vector3.new(0, 0.5, 0)), Color = rgb(190, 185, 175), Material = Enum.Material.Slate, Parent = s })
	part({ Name = "Body", Size = Vector3.new(3.4, 3.4, 3.4), CFrame = CFrame.new(sp + Vector3.new(0, 2.7, 0)), Color = rgb(220, 60, 40), Parent = s })
	part({ Name = "Door", Size = Vector3.new(1.6, 2, 0.1), CFrame = CFrame.new(sp + Vector3.new(0, 2.2, 1.72)), Color = rgb(250, 200, 50), Parent = s })
	part({ Name = "RoofL", Size = Vector3.new(2.6, 0.3, 4.6), CFrame = CFrame.new(sp + Vector3.new(-1, 4.9, 0)) * CFrame.Angles(0, 0, math.rad(30)), Color = rgb(170, 40, 30), Parent = s })
	part({ Name = "RoofR", Size = Vector3.new(2.6, 0.3, 4.6), CFrame = CFrame.new(sp + Vector3.new(1, 4.9, 0)) * CFrame.Angles(0, 0, math.rad(-30)), Color = rgb(170, 40, 30), Parent = s })
	vcyl(sp + Vector3.new(0, 1, 2.2), 0.6, 0.8, { Name = "LuHuong", Color = COLORS.gold, Material = Enum.Material.Metal, Parent = s })
	for i = -1, 1 do
		part({ Name = "Nhang", Size = Vector3.new(0.08, 1, 0.08), CFrame = CFrame.new(sp + Vector3.new(i * 0.15, 2.1, 2.2)), Color = rgb(200, 60, 40), Material = Enum.Material.Neon, CanCollide = false, CanQuery = false, Parent = s })
	end
	table.insert(gunSpawns, sp + Vector3.new(0, 0.4, -3.4))
end

---------------------------------------------------------------------------
-- Lighting
---------------------------------------------------------------------------
function MapBuilder.SetupLighting()
	-- warm Saigon sunset
	Lighting.ClockTime = 17.6
	Lighting.Brightness = 2.2
	Lighting.Ambient = rgb(110, 90, 85)
	Lighting.OutdoorAmbient = rgb(150, 120, 105)
	Lighting.GlobalShadows = true
	Lighting.EnvironmentDiffuseScale = 0.5
	Lighting.EnvironmentSpecularScale = 0.5

	local atm = Lighting:FindFirstChildOfClass("Atmosphere") or Instance.new("Atmosphere")
	atm.Density = 0.32
	atm.Offset = 0.1
	atm.Color = rgb(255, 205, 170)
	atm.Decay = rgb(120, 80, 90)
	atm.Glare = 0.3
	atm.Haze = 1.6
	atm.Parent = Lighting

	local cc = Lighting:FindFirstChildOfClass("ColorCorrectionEffect") or Instance.new("ColorCorrectionEffect")
	cc.Saturation = 0.15
	cc.Contrast = 0.05
	cc.TintColor = rgb(255, 242, 228)
	cc.Parent = Lighting

	local bloom = Lighting:FindFirstChildOfClass("BloomEffect") or Instance.new("BloomEffect")
	bloom.Intensity = 0.6
	bloom.Size = 30
	bloom.Threshold = 1.6
	bloom.Parent = Lighting
end

---------------------------------------------------------------------------
-- Lobby (floating rooftop café)
---------------------------------------------------------------------------
function MapBuilder.BuildLobby(): SpawnLocation
	-- remove template baseplate / spawns so players never spawn inside the map
	for _, child in ipairs(Workspace:GetChildren()) do
		if child:IsA("SpawnLocation") or child.Name == "Baseplate" then
			child:Destroy()
		end
	end

	local lobby = folder("Lobby", Workspace)
	local y = Config.LOBBY_HEIGHT
	local size = 70

	part({ Name = "Floor", Size = Vector3.new(size, 2, size), CFrame = CFrame.new(0, y - 1, 0), Color = rgb(190, 110, 80), Material = Enum.Material.Brick, Parent = lobby })

	for _, d in ipairs({ { 0, size / 2, size, 1 }, { 0, -size / 2, size, 1 }, { size / 2, 0, 1, size }, { -size / 2, 0, 1, size } }) do
		part({ Name = "Railing", Size = Vector3.new(d[3], 3.5, d[4]), CFrame = CFrame.new(d[1], y + 1.75, d[2]), Color = rgb(250, 245, 235), Material = Enum.Material.Concrete, Parent = lobby })
		part({ Name = "Barrier", Size = Vector3.new(d[3], 40, d[4]), CFrame = CFrame.new(d[1], y + 20, d[2]), Transparency = 1, CanQuery = false, Parent = lobby })
	end

	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "LobbySpawn"
	spawn.Anchored = true
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Size = Vector3.new(14, 1, 14)
	spawn.CFrame = CFrame.new(0, y + 0.5, 6)
	spawn.Color = rgb(220, 40, 40)
	spawn.Material = Enum.Material.Neon
	spawn.TopSurface = Enum.SurfaceType.Smooth
	spawn.Parent = lobby
	local star = part({ Name = "Star", Size = Vector3.new(4, 0.1, 4), CFrame = CFrame.new(0, y + 1.05, 6) * CFrame.Angles(0, math.rad(45), 0), Color = rgb(255, 220, 40), Material = Enum.Material.Neon, CanCollide = false, Parent = lobby })
	star.CanQuery = false

	-- title board
	local board = part({ Name = "TitleBoard", Size = Vector3.new(40, 12, 1), CFrame = CFrame.new(0, y + 9, -size / 2 + 2), Color = rgb(25, 20, 30), Parent = lobby })
	local title = sign(board, Enum.NormalId.Back, "ESCAPE THE JET\nTRỐN KHỎI JET", rgb(255, 70, 70), Enum.Font.GothamBlack)
	title.TextStrokeTransparency = 0
	part({ Name = "BoardFrame", Size = Vector3.new(41, 13, 0.8), CFrame = CFrame.new(0, y + 9, -size / 2 + 1.5), Color = rgb(255, 210, 40), Material = Enum.Material.Neon, Parent = lobby })
	part({ Name = "BoardPostL", Size = Vector3.new(1, 3, 1), CFrame = CFrame.new(-18, y + 1.5, -size / 2 + 2), Color = rgb(40, 40, 40), Parent = lobby })
	part({ Name = "BoardPostR", Size = Vector3.new(1, 3, 1), CFrame = CFrame.new(18, y + 1.5, -size / 2 + 2), Color = rgb(40, 40, 40), Parent = lobby })

	-- rules board
	local rules = part({ Name = "RulesBoard", Size = Vector3.new(1, 14, 26), CFrame = CFrame.new(size / 2 - 2, y + 7, 0), Color = rgb(30, 60, 40), Parent = lobby })
	local rulesLabel = sign(
		rules,
		Enum.NormalId.Left,
		"LUẬT CHƠI / RULES\n\n"
			.. "• 1 người là JET – có dao, đi bắt mọi người\n"
			.. "• 11 người VÔ TỘI – trốn và sống sót\n"
			.. "• 1 khẩu SÚNG giấu trong xóm – ai tìm thấy thành CÔNG AN\n"
			.. "• Công An bắn trúng Jet = người vô tội thắng\n"
			.. "• Bắn nhầm người vô tội = Công An cũng gục\n"
			.. "• Jet bắt hết mọi người = Jet thắng\n"
			.. "• Hết giờ mà còn người sống = người vô tội thắng",
		rgb(255, 255, 255),
		Enum.Font.GothamBold
	)
	rulesLabel.TextXAlignment = Enum.TextXAlignment.Left

	-- café tables, stools and string lights
	for _, p in ipairs({ Vector3.new(-20, y, 15), Vector3.new(-20, y, -10), Vector3.new(18, y, 22), Vector3.new(-5, y, 25), Vector3.new(15, y, -18) }) do
		foodSet(lobby, p, true)
	end
	for i = -3, 3 do
		lantern(lobby, Vector3.new(i * 9, y + 10, 30), false)
		lantern(lobby, Vector3.new(i * 9, y + 10, -20), false)
	end
	beam(Vector3.new(-30, y + 10.8, 30), Vector3.new(30, y + 10.8, 30), 0.1, rgb(20, 20, 20), lobby)
	beam(Vector3.new(-30, y + 10.8, -20), Vector3.new(30, y + 10.8, -20), 0.1, rgb(20, 20, 20), lobby)
	for _, c in ipairs({ Vector3.new(-30, y, 30), Vector3.new(30, y, 30), Vector3.new(-30, y, -20), Vector3.new(30, y, -20) }) do
		vcyl(c, 11, 0.4, { Name = "LightPole", Color = rgb(40, 40, 40), Parent = lobby })
		vcyl(c + Vector3.new(0, 0, 2.5), 1.4, 2, { Name = "ChauCay", Color = rgb(170, 80, 50), Parent = lobby })
		bush(lobby, c + Vector3.new(0, 1.4, 2.5), 2.4)
	end

	return spawn
end

---------------------------------------------------------------------------
-- Main map
---------------------------------------------------------------------------
function MapBuilder.BuildMap()
	local map = folder("Map_XomJet", Workspace)
	local ground = folder("Ground", map)
	local housesF = folder("NhaOng", map)
	local streetF = folder("Street", map)
	local wiresF = folder("DayDien", map)
	local alleysF = folder("Hem", map)
	local marketF = folder("Cho", map)
	local parkF = folder("CongVien", map)

	local gunSpawns: { Vector3 } = {}
	local innocentSpawns: { Vector3 } = {}

	local HALF_X = 122
	local ALLEY_SLOTS = { [6] = true, [12] = true, [18] = true }
	local alleyCenters = {}

	-------------------------------------------------- ground & road
	part({ Name = "Base", Size = Vector3.new(HALF_X * 2 + 8, 2, 210), CFrame = CFrame.new(0, -1, 0), Color = COLORS.concrete, Material = Enum.Material.Concrete, Parent = ground })
	part({ Name = "Road", Size = Vector3.new(HALF_X * 2, 0.2, 24), CFrame = CFrame.new(0, 0.1, 0), Color = COLORS.asphalt, Material = Enum.Material.Asphalt, Parent = ground })
	for x = -HALF_X + 4, HALF_X - 4, 10 do
		part({ Name = "LaneDash", Size = Vector3.new(5, 0.05, 0.4), CFrame = CFrame.new(x, 0.22, 0), Color = rgb(245, 245, 240), Material = Enum.Material.SmoothPlastic, CanCollide = false, Parent = ground })
	end
	for i = 0, 7 do
		part({ Name = "Crosswalk", Size = Vector3.new(1.4, 0.05, 20), CFrame = CFrame.new(28 + i * 2.6, 0.22, 0), Color = rgb(245, 245, 240), CanCollide = false, Parent = ground })
	end
	for _, s in ipairs({ 1, -1 }) do
		part({ Name = "Sidewalk", Size = Vector3.new(HALF_X * 2, 0.6, 6), CFrame = CFrame.new(0, 0.3, 15 * s), Color = COLORS.sidewalk, Material = Enum.Material.Brick, Parent = ground })
		part({ Name = "Curb", Size = Vector3.new(HALF_X * 2, 0.7, 0.5), CFrame = CFrame.new(0, 0.35, 12.25 * s), Color = rgb(220, 220, 215), Material = Enum.Material.Concrete, Parent = ground })
	end

	-------------------------------------------------- boundary walls with graffiti
	local GRAFFITI = { "JET ĐÃ Ở ĐÂY", "XÓM JET", "CẤM ĐUA XE", "TRỐN ĐI!", "JET 2K9", "ĐỪNG CHẠY" }
	local walls = {
		{ CFrame.new(-HALF_X - 2, 9, 0), Vector3.new(4, 18, 204), Enum.NormalId.Right },
		{ CFrame.new(HALF_X + 2, 9, 0), Vector3.new(4, 18, 204), Enum.NormalId.Left },
		{ CFrame.new(0, 9, 102), Vector3.new(HALF_X * 2 + 8, 18, 4), Enum.NormalId.Front },
		{ CFrame.new(0, 9, -102), Vector3.new(HALF_X * 2 + 8, 18, 4), Enum.NormalId.Back },
	}
	for _, w in ipairs(walls) do
		local wall = part({ Name = "Wall", Size = w[2], CFrame = w[1], Color = rgb(200, 195, 185), Material = Enum.Material.Concrete, Parent = ground })
		local tag = sign(wall, w[3], pick(GRAFFITI), pick({ rgb(255, 60, 160), rgb(60, 220, 255), rgb(255, 230, 40), rgb(120, 255, 90) }), Enum.Font.FredokaOne)
		tag.TextStrokeTransparency = 0
		tag.Rotation = rng:NextNumber(-6, 6)
		-- invisible cap so nobody climbs out
		part({ Name = "Barrier", Size = w[2] + Vector3.new(0, 60, 0), CFrame = w[1] + Vector3.new(0, 39, 0), Transparency = 1, CanQuery = false, Parent = ground })
	end

	-------------------------------------------------- "Khu Phố Văn Hóa" arch
	for _, ax in ipairs({ -108, 108 }) do
		local arch = newModel("CongKhuPho", streetF)
		for _, z in ipairs({ -11, 11 }) do
			part({ Name = "Pillar", Size = Vector3.new(1.5, 15, 1.5), CFrame = CFrame.new(ax, 7.5, z), Color = rgb(250, 220, 60), Parent = arch })
		end
		local top = part({ Name = "Top", Size = Vector3.new(1, 3, 24), CFrame = CFrame.new(ax, 15.5, 0), Color = rgb(200, 25, 30), Parent = arch })
		sign(top, Enum.NormalId.Right, "KHU PHỐ VĂN HÓA", rgb(255, 230, 60))
		sign(top, Enum.NormalId.Left, "KHU PHỐ VĂN HÓA", rgb(255, 230, 60))
	end

	-------------------------------------------------- tube houses & alleys
	local index = 0
	for i = 0, 23 do
		local cx = -115 + i * 10
		if ALLEY_SLOTS[i] then
			table.insert(alleyCenters, cx)
		else
			for _, side in ipairs({ 1, -1 }) do
				index += 1
				tubeHouse(housesF, cx, side, index, gunSpawns)
			end
		end
	end

	for _, cx in ipairs(alleyCenters) do
		for _, side in ipairs({ 1, -1 }) do
			local a = newModel("Hem_" .. cx .. "_" .. side, alleysF)
			part({ Name = "AlleyFloor", Size = Vector3.new(10, 0.4, 22), CFrame = CFrame.new(cx, 0.2, 29 * side), Color = rgb(150, 145, 140), Material = Enum.Material.Concrete, Parent = a })
			local hemSign = part({ Name = "HemSign", Size = Vector3.new(3, 1, 0.2), CFrame = CFrame.new(cx - 4.4, 8, 18.5 * side), Color = rgb(30, 80, 170), Parent = a })
			sign(hemSign, side == 1 and Enum.NormalId.Front or Enum.NormalId.Back, "HẺM " .. (100 + math.abs(cx)), rgb(255, 255, 255))
			-- lanterns strung across the alley
			for _, lz in ipairs({ 22, 28, 34 }) do
				local z = lz * side
				beam(Vector3.new(cx - 5, 14, z), Vector3.new(cx + 5, 14, z), 0.08, rgb(20, 20, 20), a)
				for k = -1, 1 do
					lantern(a, Vector3.new(cx + k * 3, 12.8, z), k == 0)
				end
			end
			trashBin(a, Vector3.new(cx + 3, 0.4, 37 * side))
			table.insert(gunSpawns, Vector3.new(cx + 3, 0.4, 34.6 * side))
			motorbike(a, Vector3.new(cx - 3, 0.4, 30 * side), math.rad(rng:NextNumber(-10, 10)))
			bush(a, Vector3.new(cx - 3.5, 0.4, 24 * side), 2)
			table.insert(innocentSpawns, Vector3.new(cx, 0.4, 26 * side))
		end
	end

	-------------------------------------------------- sidewalk life: poles, wires, bikes, food
	local poleTops = { [1] = {}, [-1] = {} }
	for _, side in ipairs({ 1, -1 }) do
		local idx = 0
		for x = -112, 112, 22.4 do
			idx += 1
			poleTops[side][idx] = powerPole(wiresF, Vector3.new(x, 0.6, 12.9 * side), side)
		end
		-- wires between neighbouring poles (+ extra messy ones)
		for i = 1, #poleTops[side] - 1 do
			local a, b = poleTops[side][i], poleTops[side][i + 1]
			for k = 1, #a do
				wire(a[k], b[k], rng:NextNumber(1, 2.6), wiresF)
			end
			for _ = 1, 3 do
				local ka, kb = rng:NextInteger(1, #a), rng:NextInteger(1, #b)
				wire(a[ka] - Vector3.new(0, rng:NextNumber(0, 4), 0), b[kb] - Vector3.new(0, rng:NextNumber(0, 4), 0), rng:NextNumber(2.5, 5), wiresF)
			end
		end
	end
	-- wires crossing the street
	for i = 1, #poleTops[1], 2 do
		local n, s = poleTops[1][i], poleTops[-1][i]
		if n and s then
			wire(n[5], s[6], 3, wiresF)
			wire(n[1], s[4], 4, wiresF)
		end
	end

	for _, side in ipairs({ 1, -1 }) do
		local x = -118
		while x < 118 do
			local nearAlley = false
			for _, cx in ipairs(alleyCenters) do
				if math.abs(x - cx) < 7 then
					nearAlley = true
				end
			end
			if not nearAlley then
				local r = rng:NextNumber()
				if r < 0.42 then
					-- row of parked motorbikes facing the street
					local yaw = side == 1 and 0 or math.pi
					motorbike(streetF, Vector3.new(x, 0.6, 15.8 * side), yaw + math.rad(rng:NextNumber(-12, 12)))
					x += 2.8
				elseif r < 0.62 then
					foodSet(streetF, Vector3.new(x + 2, 0.6, 15.5 * side), rng:NextNumber() < 0.5)
					x += 7
				elseif r < 0.68 then
					banhMiCart(streetF, Vector3.new(x + 3, 0.6, 15.2 * side), side == 1 and 0 or math.pi)
					x += 8
				else
					x += 4
				end
			else
				x += 4
			end
		end
	end

	-- Jet's racing bike (độ xe) next to the Jet's spawn
	local jetBike = motorbike(streetF, Vector3.new(-30, 0.2, 5), math.rad(90), rgb(255, 30, 30))
	jetBike.Name = "XeCuaJet"
	local glow = part({ Name = "Underglow", Size = Vector3.new(3.5, 0.1, 1.2), CFrame = CFrame.new(-30, 0.25, 5), Color = rgb(170, 60, 255), Material = Enum.Material.Neon, CanCollide = false, CanQuery = false, Parent = jetBike })
	local glowLight = Instance.new("PointLight")
	glowLight.Color = rgb(170, 60, 255)
	glowLight.Range = 10
	glowLight.Parent = glow

	for x = -100, 105, 29 do
		table.insert(innocentSpawns, Vector3.new(x, 0.6, 14))
		table.insert(innocentSpawns, Vector3.new(x + 8, 0.6, -14))
	end

	-------------------------------------------------- market (chợ xóm), north
	part({ Name = "MarketFloor", Size = Vector3.new(HALF_X * 2, 0.4, 60), CFrame = CFrame.new(0, 0.2, 70), Color = COLORS.wetConcrete, Material = Enum.Material.Slate, Parent = marketF })
	for _, z in ipairs({ 55, 70, 85 }) do
		for x = -100, 100, 20 do
			if rng:NextNumber() < 0.8 then
				marketStall(marketF, Vector3.new(x + rng:NextNumber(-1.5, 1.5), 0.4, z), gunSpawns)
			end
		end
	end
	for x = -90, 90, 30 do
		table.insert(innocentSpawns, Vector3.new(x, 0.4, 62.5))
		table.insert(innocentSpawns, Vector3.new(x + 10, 0.4, 77.5))
	end
	-- market gate
	local gate = newModel("CongCho", marketF)
	for _, x in ipairs({ -14, 14 }) do
		part({ Name = "Pillar", Size = Vector3.new(1.5, 16, 1.5), CFrame = CFrame.new(x, 8, 96), Color = rgb(200, 30, 30), Parent = gate })
	end
	local gateTop = part({ Name = "Top", Size = Vector3.new(30, 4, 1), CFrame = CFrame.new(0, 17, 96), Color = rgb(250, 210, 40), Parent = gate })
	sign(gateTop, Enum.NormalId.Front, "CHỢ XÓM MỚI", rgb(200, 20, 20))
	-- crates stacked near the walls = extra cover
	for _ = 1, 14 do
		local cx = rng:NextNumber(-115, 115)
		local cz = rng:NextNumber(92, 98)
		for h = 0, rng:NextInteger(0, 2) do
			part({ Name = "Crate", Size = Vector3.new(2.4, 2, 2.4), CFrame = CFrame.new(cx, 1.4 + h * 2, cz) * CFrame.Angles(0, rng:NextNumber(0, 0.4), 0), Color = pick({ rgb(40, 110, 200), rgb(220, 60, 40), rgb(160, 120, 70) }), Parent = marketF })
		end
	end
	table.insert(gunSpawns, Vector3.new(-112, 0.4, 94))
	table.insert(gunSpawns, Vector3.new(112, 0.4, 94))

	-------------------------------------------------- park (công viên), south
	part({ Name = "Grass", Size = Vector3.new(HALF_X * 2, 0.4, 60), CFrame = CFrame.new(0, 0.2, -70), Color = COLORS.grass, Material = Enum.Material.Grass, Parent = parkF })
	part({ Name = "Path", Size = Vector3.new(HALF_X * 2, 0.45, 5), CFrame = CFrame.new(0, 0.22, -48), Color = rgb(190, 180, 160), Material = Enum.Material.Pavement, Parent = parkF })
	part({ Name = "Path2", Size = Vector3.new(5, 0.45, 50), CFrame = CFrame.new(-20, 0.22, -73), Color = rgb(190, 180, 160), Material = Enum.Material.Pavement, Parent = parkF })

	-- lake (hồ) with lotus pads and a little bridge
	local lakeC = Vector3.new(45, 0, -74)
	part({ Name = "Ho", Size = Vector3.new(56, 0.5, 30), CFrame = CFrame.new(lakeC + Vector3.new(0, 0.5, 0)), Color = COLORS.water, Material = Enum.Material.Glass, Transparency = 0.15, Reflectance = 0.25, Parent = parkF })
	for _, e in ipairs({ { 0, 15.5, 58, 1 }, { 0, -15.5, 58, 1 }, { 28.5, 0, 1, 30 }, { -28.5, 0, 1, 30 } }) do
		part({ Name = "LakeEdge", Size = Vector3.new(e[3], 1.4, e[4]), CFrame = CFrame.new(lakeC + Vector3.new(e[1], 0.7, e[2])), Color = rgb(170, 165, 155), Material = Enum.Material.Slate, Parent = parkF })
	end
	for _ = 1, 16 do
		local lp = lakeC + Vector3.new(rng:NextNumber(-25, 25), 0.8, rng:NextNumber(-13, 13))
		cyl({ Name = "LaSen", Size = Vector3.new(0.1, 2.4, 2.4), CFrame = CFrame.new(lp) * CFrame.Angles(0, 0, math.rad(90)), Color = rgb(60, 150, 60), CanCollide = false, Parent = parkF })
		if rng:NextNumber() < 0.4 then
			ball({ Name = "HoaSen", Size = Vector3.new(0.8, 0.8, 0.8), CFrame = CFrame.new(lp + Vector3.new(0, 0.3, 0)), Color = rgb(250, 140, 180), CanCollide = false, Parent = parkF })
		end
	end
	local bridge = newModel("CauGo", parkF)
	part({ Name = "Deck", Size = Vector3.new(5, 0.6, 34), CFrame = CFrame.new(lakeC + Vector3.new(0, 1.6, 0)), Color = rgb(170, 50, 40), Material = Enum.Material.WoodPlanks, Parent = bridge })
	for _, x in ipairs({ -2.4, 2.4 }) do
		part({ Name = "Rail", Size = Vector3.new(0.3, 2.5, 34), CFrame = CFrame.new(lakeC + Vector3.new(x, 3, 0)), Color = rgb(200, 40, 30), Parent = bridge })
	end
	for _, r in ipairs({ Vector3.new(-30, 0.4, -9), Vector3.new(30, 0.4, 10), Vector3.new(-31, 0.4, 12) }) do
		local rp = lakeC + r
		for _ = 1, 3 do
			local s = rng:NextNumber(2, 4)
			ball({ Name = "Rock", Size = Vector3.new(s, s, s), CFrame = CFrame.new(rp + Vector3.new(rng:NextNumber(-1.5, 1.5), s / 3, rng:NextNumber(-1.5, 1.5))), Color = rgb(120, 115, 110), Material = Enum.Material.Rock, Parent = parkF })
		end
		table.insert(gunSpawns, rp + Vector3.new(0, 0, rp.Z > lakeC.Z and 2.5 or -2.5))
	end

	banyanTree(parkF, Vector3.new(-65, 0.4, -72), gunSpawns)

	-- café cóc in the park
	local cafe = newModel("CaPheCoc", parkF)
	for _, x in ipairs({ -12, -6, 0 }) do
		foodSet(cafe, Vector3.new(x - 2, 0.4, -58), false)
	end
	for _, x in ipairs({ -17, 3 }) do
		for _, z in ipairs({ -53, -63 }) do
			vcyl(Vector3.new(x, 0.4, z), 8, 0.3, { Name = "Pole", Color = COLORS.metal, Parent = cafe })
		end
	end
	local cafeTarp = part({ Name = "Tarp", Size = Vector3.new(21, 0.2, 11), CFrame = CFrame.new(-7, 8.5, -58), Color = rgb(40, 90, 200), Material = Enum.Material.Fabric, Parent = cafe })
	cafeTarp.CanCollide = false
	local cafeSign = part({ Name = "Sign", Size = Vector3.new(8, 1.6, 0.2), CFrame = CFrame.new(-7, 7, -52.6), Color = rgb(60, 35, 20), CanCollide = false, Parent = cafe })
	sign(cafeSign, Enum.NormalId.Back, "CÀ PHÊ SỮA ĐÁ", rgb(255, 240, 200))

	-- benches & bushes
	for _, bpos in ipairs({ Vector3.new(85, 0.4, -55), Vector3.new(100, 0.4, -70), Vector3.new(85, 0.4, -90), Vector3.new(-100, 0.4, -55), Vector3.new(-30, 0.4, -92) }) do
		local b = newModel("GheDa", parkF)
		part({ Name = "Seat", Size = Vector3.new(6, 0.5, 2), CFrame = CFrame.new(bpos + Vector3.new(0, 1.6, 0)), Color = rgb(200, 195, 185), Material = Enum.Material.Marble, Parent = b })
		for _, x in ipairs({ -2.4, 2.4 }) do
			part({ Name = "Leg", Size = Vector3.new(0.6, 1.4, 1.6), CFrame = CFrame.new(bpos + Vector3.new(x, 0.7, 0)), Color = rgb(170, 165, 155), Parent = b })
		end
	end
	for _ = 1, 22 do
		local bp = Vector3.new(rng:NextNumber(-115, 115), 0.4, rng:NextNumber(-97, -88))
		bush(parkF, bp, rng:NextNumber(3, 5))
		if rng:NextNumber() < 0.3 then
			table.insert(gunSpawns, bp + Vector3.new(0, 0, -2))
		end
	end
	for _ = 1, 10 do
		bush(parkF, Vector3.new(rng:NextNumber(80, 115), 0.4, rng:NextNumber(-85, -50)), rng:NextNumber(2.5, 4))
	end
	for _, p in ipairs({ Vector3.new(-90, 0.4, -65), Vector3.new(-40, 0.4, -80), Vector3.new(0, 0.4, -75), Vector3.new(95, 0.4, -62), Vector3.new(90, 0.4, -82), Vector3.new(-100, 0.4, -85) }) do
		table.insert(innocentSpawns, p)
	end

	return {
		JetSpawn = Vector3.new(-30, 0.2, 0),
		InnocentSpawns = innocentSpawns,
		GunSpawns = gunSpawns,
	}
end

return MapBuilder
