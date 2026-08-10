# BlueMap Marker Clustering Script

A custom BlueMap web addon that groups nearby markers into clusters, displaying a count badge. Dramatically improves performance on maps with many POI markers by reducing DOM elements and culling off-screen markers.

## Features

- **Marker Clustering** - Markers that overlap on screen get grouped into a single badge showing the count
- **Click to Expand** - Click a cluster badge to reveal the individual markers
- **Off-Screen Culling** - Markers far outside the viewport are hidden from rendering entirely
- **Throttled Updates** - Clustering recalculates on a configurable interval (default 300ms) instead of every frame
- **Player Marker Exclusion** - Player head markers are excluded from clustering by default (they move)
- **Hover Tooltip** - Hovering a cluster shows the names of all markers inside it
- **Configurable** - Adjust cluster radius, update speed, culling padding, and more

## Installation

1. Copy `marker-cluster.js` and `marker-cluster.css` into your BlueMap webroot folder:
   ```
   ./bluemap/web/marker-cluster.js
   ./bluemap/web/marker-cluster.css
   ```

2. Edit your `webapp.conf` (usually at `./plugins/BlueMap/webapp.conf`) and add both files:
   ```hocon
   scripts: [
       "marker-cluster.js"
   ]

   styles: [
       "marker-cluster.css"
   ]
   ```

3. Reload BlueMap:
   ```
   /bluemap reload light
   ```

4. Open your map in a browser. Markers that are close together will now cluster.

## Configuration

Open `marker-cluster.js` and edit the `CONFIG` object at the top:

| Option | Default | Description |
|--------|---------|-------------|
| `clusterRadius` | `60` | Pixel distance within which markers get grouped |
| `minClusterSize` | `2` | Minimum markers needed to form a cluster |
| `updateInterval` | `300` | Milliseconds between clustering recalculations |
| `cullOffScreen` | `true` | Hide markers outside the viewport for performance |
| `cullPadding` | `200` | Extra pixels beyond viewport edge before culling |
| `skipPlayerMarkers` | `true` | Exclude player head markers from clustering |
| `skipPopupMarker` | `true` | Exclude the click-popup marker |
| `maxClusterZoom` | `Infinity` | Zoom level above which clustering disables |
| `animate` | `true` | Enable pop-in animation for cluster badges |

## Performance Tips

If your map is still laggy after installing this script, try these additional tweaks:

- **Increase `clusterRadius`** to `80`-`100` to group more aggressively
- **Increase `updateInterval`** to `500` if CPU is still high (slightly less responsive)
- **Enable `cullOffScreen`** (on by default) - this alone helps significantly with 100+ markers
- **Reduce marker icon sizes** in your marker configs - smaller images = faster rendering
- **Use fewer marker sets** - each set adds overhead to BlueMap's internal rendering loop

## How It Works

1. Every `updateInterval` ms, the script scans all visible POI/HTML marker DOM elements
2. It parses their `transform: translate(x, y)` to get screen positions
3. Off-screen markers get `visibility: hidden` (still in DOM but skip paint/composite)
4. Remaining markers are grouped using a greedy nearest-neighbor algorithm
5. Groups with 2+ markers get hidden and replaced with a cluster badge at the centroid
6. Clicking a badge removes it and restores the individual markers

## Debugging

Open browser console and:
- Check for `[MarkerCluster] Initialized` message on load
- Call `BlueMapClusterDestroy()` to disable clustering and restore all markers
- Inspect `#bm-cluster-overlay` to see active cluster badges

## Compatibility

- Works with BlueMap v3.x and v5.x web app
- Works on all platforms (Paper, Fabric, Forge, Sponge, standalone)
- Does not require any server-side plugins
- Compatible with other BlueMap web addons

## License

MIT - Free to use and modify.
