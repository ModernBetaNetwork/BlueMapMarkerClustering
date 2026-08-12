# BlueMap Marker Clustering Script

A custom BlueMap web addon that groups nearby markers into clusters, displaying a count badge. Improves performance on maps with many POI markers by reducing DOM elements and culling off-screen markers.

## Features

- **Marker Clustering** - Markers that overlap on screen get grouped into a single badge showing the count
- **Click to Expand** - Click a cluster badge to reveal the individual markers
- **Auto Re-Collapse** - Expanded clusters automatically re-collapse when the mouse moves away
- **Off-Screen Culling** - Markers far outside the viewport are hidden from rendering entirely
- **Throttled Updates** - Clustering recalculates on a configurable interval (default 500ms) instead of every frame
- **Live Badge Tracking** - Cluster badges follow their markers in real-time via requestAnimationFrame
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

4. Open map in a browser. Markers that are close together will now cluster.

## Configuration

Open `marker-cluster.js` and edit the `CONFIG` object at the top:

| Option | Default | Description |
|--------|---------|-------------|
| `clusterRadius` | `80` | Pixel distance within which markers get grouped |
| `minClusterSize` | `3` | Minimum markers needed to form a cluster |
| `maxClusterSize` | `8` | Maximum markers allowed in a single cluster (forces large groups to break up) |
| `groupingInterval` | `500` | Milliseconds between clustering recalculations |
| `cullOffScreen` | `true` | Hide markers outside the viewport for performance |
| `cullPadding` | `200` | Extra pixels beyond viewport edge before culling |

## Performance Tips

If your map is still laggy after installing this script, try these additional tweaks:

- **Increase `clusterRadius`** (pixels) to group more aggressively
- **Increase `groupingInterval`** (ms) if CPU is still high (slightly less responsive)
- **Enable `cullOffScreen`** (on by default) - this alone helps significantly with 100+ markers
- **Reduce marker icon sizes** in your marker configs - smaller images = faster rendering
- **Use fewer marker sets** - each set adds overhead to BlueMap's internal rendering loop

## How It Works

1. Every `groupingInterval` ms, the script scans all visible POI/HTML marker DOM elements
2. It parses their `transform: translate(x, y)` to get screen positions
3. Off-screen markers get `visibility: hidden` (still in DOM but skip paint/composite)
4. Remaining markers are grouped using a greedy nearest-neighbor algorithm
5. Groups meeting the `minClusterSize` threshold get hidden (`display: none` via CSS class) and replaced with a cluster badge at the centroid
6. Badge positions update every frame via requestAnimationFrame to stay glued to moving markers
7. Clicking a badge removes it and restores the individual markers
8. When the mouse moves away from an expanded group (beyond `clusterRadius`), it automatically re-collapses

## Debugging

Open browser console and:
- Check for `[MarkerCluster] Initialized` message on load
- Call `BlueMapClusterDestroy()` to disable clustering and restore all markers
- Access `BlueMapClusterConfig` to view or modify config at runtime

## License

MIT - Free to use and modify.
