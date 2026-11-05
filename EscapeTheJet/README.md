# Escape The Jet (Trốn Khỏi Jet) – Roblox game

> **Jet** is Vietnamese slang for a troublemaking street youth who hangs out, picks fights and street-races.
> In this game the Jet roams a Vietnamese *xóm* (neighbourhood) with a knife and hunts everyone else down.

## How a round works

| | |
|---|---|
| **Players** | Up to 12: **1 Jet** + **11 Innocents** (a round can start with as few as 2) |
| **Hide phase (15 s)** | The Jet is frozen and blindfolded while everyone runs off to hide |
| **Hunt (3 min)** | The Jet gets a **knife**. Getting slashed means **you're caught and you lose**: you go back to the lobby to watch |
| **The hidden gun** | **1 gun** spawns at a random hiding spot (behind shop counters, under market stalls, behind alley trash bins, by the banyan-tree shrine, behind lake rocks, in bushes…). The first innocent to touch it becomes the **Police (Công An)** |
| **Police** | Shoot the Jet and the innocents win. Shoot an innocent and **you go down too**. If the Police dies, the gun drops where they fell so someone else can grab it |
| **Jet wins** | when every innocent has been caught |
| **Innocents win** | if the Police shoots the Jet, the timer runs out, or the Jet leaves |

Winners get +1 **Wins** on the leaderboard.

## The map: a Vietnamese xóm

Everything is built from code in `MapBuilder.lua`, so you don't need to upload any assets:

- **Main street** with asphalt, red-tile sidewalks, a crosswalk and *“Khu Phố Văn Hóa”* arches
- **Nhà ống (tube houses)**: narrow pastel 3–5 storey houses with balconies, laundry, potted plants,
  rooftop **inox water tanks**, roll-down **cửa cuốn** shutters, and open shop fronts you can walk into
  (Phở Bò, Bánh Mì, Cà Phê, Tạp Hóa, Net Cỏ, Bia Hơi, Karaoke…)
- **Concrete power poles** with the famous **tangled electric wires** and street lamps
- Parked **xe máy** (motorbikes), **quán cóc** plastic-stool street food, **bánh mì carts**
- Three **hẻm (alleys)** with red lanterns, trash bins and motorbikes leading to the back areas
- **Chợ Xóm Mới**, a wet market with tarp-covered stalls, fruit baskets and crates
- A **park** with a lotus lake and red bridge, a giant **cây đa (banyan tree)** with aerial roots,
  a small **miếu (shrine)** with incense, and a *cà phê sữa đá* corner
- The **Jet's spawn** next to his red racing bike with purple underglow
- A **floating rooftop-café lobby** with the title board and rules

## Project layout (Rojo)

```
EscapeTheJet/
├── default.project.json
└── src/
    ├── shared/Config.lua               -> ReplicatedStorage.Shared.Config   (all tunable settings)
    ├── server/GameManager.server.lua   -> ServerScriptService.Server.GameManager  (round logic)
    ├── server/MapBuilder.lua           -> ServerScriptService.Server.MapBuilder   (map + lobby + lighting)
    ├── server/Weapons.lua              -> ServerScriptService.Server.Weapons      (knife, gun, looks)
    └── client/HUD.client.lua           -> StarterPlayer.StarterPlayerScripts.Client.HUD
```

## Setup

### Option A: Rojo (recommended)
1. Install [Rojo](https://rojo.space) and the Rojo Studio plugin.
2. Open a terminal in this `EscapeTheJet` folder:
   ```bash
   rojo serve
   ```
3. In Roblox Studio, open a new **Baseplate** place, click **Connect** in the Rojo plugin, then press **Play**.

   Or build a place file directly:
   ```bash
   rojo build -o EscapeTheJet.rbxlx
   ```

### Option B: Copy and paste into Studio
1. In **ReplicatedStorage**, create a **Folder** called `Shared`, and inside it a **ModuleScript** called `Config`. Paste in `src/shared/Config.lua`.
2. In **ServerScriptService**, create a **Folder** called `Server`. Inside it create:
   - a **Script** called `GameManager` (paste in `GameManager.server.lua`)
   - a **ModuleScript** called `MapBuilder` (paste in `MapBuilder.lua`)
   - a **ModuleScript** called `Weapons` (paste in `Weapons.lua`)
3. In **StarterPlayer > StarterPlayerScripts**, create a **LocalScript** called `HUD` (paste in `HUD.client.lua`).
4. Press **Play**. The map, lobby and lighting are generated when the server starts. The default Baseplate and SpawnLocation are removed automatically.

### Publish settings
- Set the server size to **12 players**: *Game Settings → Places → (your place) → Max Players / Server Size = 12*, or do it from the Creator Dashboard.
- To test with 2+ players in Studio, use **Test → Clients and Servers → 2 Players → Start**.

## Tuning
Everything lives in `Config.lua`: hide time, round length, Jet speed, knife range and cooldown, gun cooldown,
minimum players and sounds. The gunshot sound is empty by default. Paste any audio id
(`"rbxassetid://..."`) into `Config.SOUNDS.GunShot`.

## Controls
- **Jet**: click or tap to slash with the knife (range about 7 studs)
- **Police**: click or tap where you want to shoot (2.5 s cooldown)
- **Innocents**: run, hide, and look for the glowing gun
