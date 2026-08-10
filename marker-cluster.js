/**
 * BlueMap Marker Clustering Script
 * Groups nearby markers into clusters with a count badge.
 * Optimizes performance by culling off-screen markers and throttling updates.
 *
 * Installation:
 *   1. Place marker-cluster.js and marker-cluster.css in your BlueMap webroot (e.g. ./bluemap/web/)
 *   2. Add to webapp.conf:
 *        scripts: ["marker-cluster.js"]
 *        styles: ["marker-cluster.css"]
 *   3. Reload BlueMap with: /bluemap reload light
 */

(function () {
    "use strict";

    // =========================================================================
    // CONFIGURATION
    // =========================================================================
    const CONFIG = {
        // Pixel radius for clustering — markers within this distance get grouped
        clusterRadius: 80,

        // Minimum markers needed to form a cluster (below this, markers show individually)
        minClusterSize: 3,

        // Maximum markers allowed in a single cluster (forces large groups to break up)
        maxClusterSize: 8,

        // How often (ms) the cluster grouping recalculates
        groupingInterval: 500,

        // Hide markers outside viewport for performance
        cullOffScreen: true,
        cullPadding: 200,
    };

    // =========================================================================
    // STATE
    // =========================================================================
    let markerContainer = null;
    let clusterWrapper = null;
    let isRunning = false;
    let groupingTimer = null;
    let rafId = null;

    // Current cluster groups: array of { badge, markerEls[] }
    let clusterGroups = [];

    // Markers that have been expanded (clicked) — skip these during grouping
    let expandedMarkers = new Set();

    // Track expanded groups with their centroid for mouse-distance re-collapse
    // Array of { markerEls[], cx, cy }
    let expandedGroups = [];

    // Current mouse position
    let mouseX = 0, mouseY = 0;

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    function init() {
        const mapContainer = document.getElementById("map-container");
        if (!mapContainer) { setTimeout(init, 500); return; }

        const findOverlay = () => {
            const root = mapContainer.querySelector('div[style*="position: relative"]');
            if (!root) return null;
            for (let i = 0; i < root.children.length; i++) {
                const child = root.children[i];
                if (child.tagName === "DIV" && child.style.overflow === "hidden" && child.style.position === "absolute") {
                    return child;
                }
            }
            return null;
        };

        markerContainer = findOverlay();
        if (!markerContainer) { setTimeout(init, 500); return; }

        // Wrapper that holds all cluster badges
        clusterWrapper = document.createElement("div");
        clusterWrapper.id = "bm-cluster-wrapper";
        clusterWrapper.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;overflow:visible;z-index:10000;";
        markerContainer.appendChild(clusterWrapper);

        isRunning = true;
        scheduleGrouping();
        startPositionLoop();

        // Track mouse position for re-collapsing expanded clusters
        markerContainer.parentElement.addEventListener("mousemove", function (e) {
            const rect = markerContainer.getBoundingClientRect();
            mouseX = e.clientX - rect.left;
            mouseY = e.clientY - rect.top;
        });

        console.log("[MarkerCluster] Initialized. Radius: " + CONFIG.clusterRadius + "px, minSize: " + CONFIG.minClusterSize);
    }

    // =========================================================================
    // GROUPING (runs on timer)
    // =========================================================================
    function scheduleGrouping() {
        if (!isRunning) return;
        groupingTimer = setTimeout(() => {
            performGrouping();
            scheduleGrouping();
        }, CONFIG.groupingInterval);
    }

    function performGrouping() {
        if (!markerContainer || !clusterWrapper) return;

        const viewportWidth = markerContainer.offsetWidth || window.innerWidth;
        const viewportHeight = markerContainer.offsetHeight || window.innerHeight;

        // --- Collect eligible on-screen markers ---
        const markers = [];
        const allWrappers = markerContainer.children;

        for (let i = 0; i < allWrappers.length; i++) {
            const wrapper = allWrappers[i];
            if (wrapper === clusterWrapper) continue;

            const inner = wrapper.firstElementChild;
            if (!inner) continue;

            if (!inner.classList.contains("bm-marker-html") && !inner.classList.contains("bm-marker-poi")) continue;

            const pos = getTranslatePosition(wrapper);
            if (!pos) continue;

            // Skip markers BlueMap has hidden
            if (wrapper.style.display === "none" && !wrapper.classList.contains("bm-clustered-hidden")) continue;

            // Skip markers the user has expanded
            if (expandedMarkers.has(wrapper)) continue;

            // Cull off-screen
            if (CONFIG.cullOffScreen) {
                if (pos.x < -CONFIG.cullPadding || pos.x > viewportWidth + CONFIG.cullPadding ||
                    pos.y < -CONFIG.cullPadding || pos.y > viewportHeight + CONFIG.cullPadding) {
                    if (wrapper.style.visibility !== "hidden") wrapper.style.visibility = "hidden";
                    // If this marker was expanded but is now off-screen, un-expand it
                    expandedMarkers.delete(wrapper);
                    continue;
                } else {
                    if (wrapper.style.visibility === "hidden") wrapper.style.visibility = "";
                }
            }

            markers.push({ wrapper, inner, x: pos.x, y: pos.y });
        }

        // --- Clear previous clustering ---
        const hiddenEls = markerContainer.querySelectorAll(".bm-clustered-hidden");
        for (let i = 0; i < hiddenEls.length; i++) {
            hiddenEls[i].classList.remove("bm-clustered-hidden");
        }
        clusterWrapper.innerHTML = "";
        clusterGroups = [];

        // --- Check expanded groups: re-collapse if mouse is far from their centroid ---
        const collapseDistance = CONFIG.clusterRadius * 1;
        const collapseSq = collapseDistance * collapseDistance;

        for (let i = expandedGroups.length - 1; i >= 0; i--) {
            const eg = expandedGroups[i];
            // Compute current centroid of this expanded group
            let sx = 0, sy = 0, cnt = 0;
            for (let j = 0; j < eg.markerEls.length; j++) {
                const pos = getTranslatePosition(eg.markerEls[j]);
                if (pos) { sx += pos.x; sy += pos.y; cnt++; }
            }
            if (cnt === 0) { expandedGroups.splice(i, 1); continue; }

            const cx = sx / cnt;
            const cy = sy / cnt;
            const dx = mouseX - cx;
            const dy = mouseY - cy;

            if ((dx * dx + dy * dy) > collapseSq) {
                // Mouse is far enough — re-collapse
                for (let j = 0; j < eg.markerEls.length; j++) {
                    expandedMarkers.delete(eg.markerEls[j]);
                }
                expandedGroups.splice(i, 1);
            }
        }

        // --- Greedy clustering ---
        const used = new Array(markers.length).fill(false);
        const radiusSq = CONFIG.clusterRadius * CONFIG.clusterRadius;

        for (let i = 0; i < markers.length; i++) {
            if (used[i]) continue;

            const group = [i];
            let cx = markers[i].x, cy = markers[i].y;
            used[i] = true;

            for (let j = i + 1; j < markers.length; j++) {
                if (used[j]) continue;
                if (group.length >= CONFIG.maxClusterSize) break;
                const dx = markers[j].x - cx;
                const dy = markers[j].y - cy;
                if ((dx * dx + dy * dy) <= radiusSq) {
                    group.push(j);
                    used[j] = true;
                    let sx = 0, sy = 0;
                    for (let k = 0; k < group.length; k++) { sx += markers[group[k]].x; sy += markers[group[k]].y; }
                    cx = sx / group.length;
                    cy = sy / group.length;
                }
            }

            if (group.length >= CONFIG.minClusterSize) {
                const markerEls = [];
                for (let j = 0; j < group.length; j++) {
                    markers[group[j]].wrapper.classList.add("bm-clustered-hidden");
                    markerEls.push(markers[group[j]].wrapper);
                }

                // Create badge
                const badge = document.createElement("div");
                badge.className = "bm-cluster-badge";
                badge.style.position = "absolute";
                badge.style.pointerEvents = "auto";

                const count = document.createElement("span");
                count.className = "bm-cluster-count";
                count.textContent = group.length;
                badge.appendChild(count);

                const size = Math.min(60, 30 + Math.log2(group.length) * 8);
                badge.style.width = size + "px";
                badge.style.height = size + "px";

                // Tooltip
                const names = group.map(function (idx) {
                    const label = markers[idx].inner.querySelector(".bm-marker-poi-label");
                    return label ? label.textContent : "marker";
                }).join("\n");
                badge.title = group.length + " markers:\n" + names;

                badge.style.left = cx + "px";
                badge.style.top = cy + "px";

                badge.addEventListener("click", createExpandHandler(markerEls, badge));
                clusterWrapper.appendChild(badge);

                clusterGroups.push({ badge, markerEls });
            }
        }
    }

    // =========================================================================
    // POSITION LOOP (requestAnimationFrame)
    // Reads current marker transforms (which BlueMap updates every frame)
    // and moves badges to their centroid. Keeps badges glued to markers.
    // =========================================================================
    function startPositionLoop() {
        function updatePositions() {
            if (!isRunning) return;

            for (let i = 0; i < clusterGroups.length; i++) {
                const group = clusterGroups[i];
                const els = group.markerEls;
                let sumX = 0, sumY = 0, count = 0;

                for (let j = 0; j < els.length; j++) {
                    const pos = getTranslatePosition(els[j]);
                    if (pos) {
                        sumX += pos.x;
                        sumY += pos.y;
                        count++;
                    }
                }

                if (count > 0) {
                    group.badge.style.left = (sumX / count) + "px";
                    group.badge.style.top = (sumY / count) + "px";
                }
            }

            rafId = requestAnimationFrame(updatePositions);
        }

        rafId = requestAnimationFrame(updatePositions);
    }

    // =========================================================================
    // HANDLERS
    // =========================================================================
    function createExpandHandler(markerEls, badge) {
        return function (e) {
            e.stopPropagation();
            for (let j = 0; j < markerEls.length; j++) {
                markerEls[j].classList.remove("bm-clustered-hidden");
                expandedMarkers.add(markerEls[j]);
            }
            badge.remove();
            clusterGroups = clusterGroups.filter(function (g) { return g.badge !== badge; });

            // Store this expanded group so we can re-collapse when mouse moves away
            expandedGroups.push({ markerEls: markerEls });
        };
    }

    // =========================================================================
    // UTILITIES
    // =========================================================================
    function getTranslatePosition(el) {
        const transform = el.style.transform;
        if (!transform) return null;
        const match = transform.match(/translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/);
        if (!match) return null;
        return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
    }

    // =========================================================================
    // CLEANUP
    // =========================================================================
    function destroy() {
        isRunning = false;
        if (groupingTimer) clearTimeout(groupingTimer);
        if (rafId) cancelAnimationFrame(rafId);

        if (clusterWrapper && clusterWrapper.parentNode) clusterWrapper.remove();
        clusterGroups = [];
        expandedMarkers.clear();
        expandedGroups = [];

        if (markerContainer) {
            const hidden = markerContainer.querySelectorAll(".bm-clustered-hidden");
            for (let i = 0; i < hidden.length; i++) hidden[i].classList.remove("bm-clustered-hidden");
            for (let i = 0; i < markerContainer.children.length; i++) {
                if (markerContainer.children[i].style.visibility === "hidden") {
                    markerContainer.children[i].style.visibility = "";
                }
            }
        }
    }

    window.BlueMapClusterDestroy = destroy;
    window.BlueMapClusterConfig = CONFIG;

    // =========================================================================
    // START
    // =========================================================================
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
