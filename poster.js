/*
 * poster.js — map-to-poster pipeline ported from Terraink.
 *
 * Portions of this file are derived from Terraink (github.com/yousifamanuel/terraink)
 * by Yousuf Amanuel, licensed under AGPL-3.0-only. See LICENSE for details.
 *
 * Exposes window.Poster = { generate, THEMES, GLOBE_TO_TERRAINK, geocodeCity }.
 * generate({ city, country, lat, lon, globeThemeKey, widthInches, heightInches, zoom, fontFamily })
 *   → Promise that resolves once the PNG has been downloaded.
 */
(function () {
  "use strict";

  /* ============================================================
   * 1. Color utilities
   * ============================================================ */

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function parseHex(hex) {
    if (typeof hex !== "string") return null;
    let s = hex.trim().replace("#", "");
    if (s.length === 3) s = s.split("").map((c) => c + c).join("");
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    const n = parseInt(s, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function normalizeHexColor(color) {
    const rgb = parseHex(color);
    if (!rgb) return "";
    return (
      "#" +
      [rgb.r, rgb.g, rgb.b]
        .map((v) => clamp(v, 0, 255).toString(16).padStart(2, "0"))
        .join("")
    );
  }

  function blendHex(hexA, hexB, weight) {
    const w = weight == null ? 0.5 : clamp(weight, 0, 1);
    const a = parseHex(hexA);
    const b = parseHex(hexB);
    if (!a && !b) return "#888888";
    if (!a) return hexB;
    if (!b) return hexA;
    const mix = (x, y) => Math.round(x * (1 - w) + y * w);
    const h = (v) => v.toString(16).padStart(2, "0");
    return "#" + h(mix(a.r, b.r)) + h(mix(a.g, b.g)) + h(mix(a.b, b.b));
  }

  function withAlpha(hex, alpha) {
    const rgb = parseHex(hex);
    if (!rgb) return "rgba(0, 0, 0, " + alpha + ")";
    return "rgba(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ", " + alpha + ")";
  }

  /* ============================================================
   * 2. Theme registry (Terraink palettes for the 7 Globe themes)
   * ============================================================ */

  const RAW_THEMES = {
    warm_beige: {
      name: "Warm Beige",
      description: "Earthy warm neutrals with sepia tones - vintage map aesthetic",
      ui: { bg: "#F5F0E8", text: "#6B5B4F" },
      map: {
        land: "#F5F0E8",
        water: "#D8D0C0",
        waterway: "#D8D0C0",
        parks: "#EAE6DC",
        buildings: "#BFB09E",
        aeroway: "#EAE6DC",
        rail: "#6b5b4f",
        roads: {
          major: "#6B4828",
          path: "#D4B898",
          outline: "#DCC4A8",
          minor_high: "#9A7050",
          minor_mid: "#C09878",
          minor_low: "#C8A888",
        },
      },
    },
    midnight_blue: {
      name: "Midnight Blue",
      description: "Deep navy base with pale roads and cool blue accents.",
      ui: { bg: "#0E1A2B", text: "#E8EEF7" },
      map: {
        land: "#0E1A2B",
        landcover: "#12223A",
        water: "#091524",
        waterway: "#091524",
        parks: "#16283F",
        buildings: "#6A7FA1",
        aeroway: "#16283F",
        rail: "#e8eef7",
        roads: {
          major: "#E8EEF7",
          path: "#2F4262",
          outline: "#172842",
          minor_high: "#B9C5D9",
          minor_mid: "#6F809F",
          minor_low: "#445874",
        },
      },
    },
    terracotta: {
      name: "Terracotta",
      description: "Mediterranean warmth - burnt orange and clay tones on cream",
      ui: { bg: "#F5EDE4", text: "#8B4513" },
      map: {
        land: "#F5EDE4",
        landcover: "#EFE7DA",
        water: "#A8C4C4",
        waterway: "#A8C4C4",
        parks: "#E8E0D0",
        buildings: "#D9A08A",
        aeroway: "#E8E0D0",
        rail: "#8b4513",
        roads: {
          major: "#A0522D",
          path: "#E4C8B0",
          outline: "#EAD4C0",
          minor_high: "#C07048",
          minor_mid: "#DCA882",
          minor_low: "#D8B898",
        },
      },
    },
    blueprint: {
      name: "Blueprint",
      description: "Classic architectural blueprint - technical drawing aesthetic",
      ui: { bg: "#1A3A5C", text: "#E8F4FF" },
      map: {
        land: "#1A3A5C",
        landcover: "#1D4066",
        water: "#0E2740",
        waterway: "#0E2740",
        parks: "#1F466F",
        buildings: "#6EA4CC",
        aeroway: "#1F466F",
        rail: "#e8f4ff",
        roads: {
          major: "#D8EEFA",
          path: "#526c88",
          outline: "#607993",
          minor_high: "#7AAED0",
          minor_mid: "#435f7d",
          minor_low: "#375473",
        },
      },
    },
    sage: {
      name: "Sage",
      description: "Muted herbal greens on a dusty cream backdrop.",
      ui: { bg: "#EDE9D8", text: "#3C4A38" },
      map: {
        land: "#EDE9D8",
        landcover: "#E4E0CD",
        water: "#CFD6C2",
        waterway: "#CFD6C2",
        parks: "#D8DCC2",
        buildings: "#A8B29A",
        aeroway: "#D8DCC2",
        rail: "#3C4A38",
        roads: {
          major: "#3C4A38",
          path: "#C2C9B0",
          outline: "#CED3BA",
          minor_high: "#6B7A5E",
          minor_mid: "#8F9A80",
          minor_low: "#A8B29A",
        },
      },
    },
    noir: {
      name: "Noir",
      description: "Pure monochrome — ink lines on charcoal.",
      ui: { bg: "#121212", text: "#EDEDED" },
      map: {
        land: "#121212",
        landcover: "#191919",
        water: "#0A0A0A",
        waterway: "#0A0A0A",
        parks: "#1C1C1C",
        buildings: "#6A6A6A",
        aeroway: "#1C1C1C",
        rail: "#ededed",
        roads: {
          major: "#F0F0F0",
          path: "#3a3a3a",
          outline: "#222222",
          minor_high: "#BFBFBF",
          minor_mid: "#6F6F6F",
          minor_low: "#444444",
        },
      },
    },
    neon: {
      name: "Neon",
      description: "Neon-drenched high-contrast palette with magenta and cyan accents.",
      ui: { bg: "#0B0F1A", text: "#00F5FF" },
      map: {
        land: "#0B0F1A",
        landcover: "#130D22",
        water: "#001433",
        waterway: "#002044",
        parks: "#1A0B2A",
        buildings: "#FF2D95",
        aeroway: "#1A0B2A",
        rail: "#00F5FF",
        roads: {
          major: "#FF2D95",
          path: "#21203A",
          outline: "#0B0F1A",
          minor_high: "#FF6EB4",
          minor_mid: "#8A33FF",
          minor_low: "#4A0099",
        },
      },
    },
  };

  /**
   * Fill in any missing map colors via blendHex fallbacks. Matches Terraink's
   * themeRepository.normalizeTheme() behaviour so warm_beige (which has no
   * explicit landcover) and user-supplied themes still render cleanly.
   */
  function normalizeTheme(raw) {
    const ui = raw.ui || {};
    const map = raw.map || {};
    const roads = map.roads || {};
    const uiBg = ui.bg || "#F5EDE4";
    const uiText = ui.text || "#8B4513";
    const land = map.land || uiBg;
    const water = map.water || "#A8C4C4";
    const waterway = map.waterway || water;
    const parks = map.parks || "#E8E0D0";
    const landcover = map.landcover || blendHex(land, parks, 0.35);
    const roadMajor = roads.major || uiText;
    const roadMinorHigh = roads.minor_high || roadMajor;
    const roadMinorMid = roads.minor_mid || roadMinorHigh;
    const roadMinorLow = roads.minor_low || blendHex(roadMinorMid, land, 0.28);
    const roadPath = roads.path || roadMinorLow;
    const roadOutline = roads.outline || blendHex(land, uiText, 0.12);
    const buildings = map.buildings || blendHex(land, uiText, 0.14);
    const aeroway = map.aeroway || blendHex(land, water, 0.2);
    const rail = map.rail || normalizeHexColor(uiText) || "#8B4513";
    return {
      name: raw.name || "Theme",
      description: raw.description || "",
      ui: { bg: uiBg, text: uiText },
      map: {
        land, landcover, water, waterway, parks, buildings, aeroway, rail,
        roads: {
          major: roadMajor, minor_high: roadMinorHigh, minor_mid: roadMinorMid,
          minor_low: roadMinorLow, path: roadPath, outline: roadOutline,
        },
      },
    };
  }

  const THEMES = Object.fromEntries(
    Object.entries(RAW_THEMES).map(([k, v]) => [k, normalizeTheme(v)]),
  );

  /** Globe theme key → Terraink theme key. */
  const GLOBE_TO_TERRAINK = {
    atlas: "warm_beige",
    midnight: "midnight_blue",
    terracotta: "terracotta",
    blueprint: "blueprint",
    sage: "sage",
    noir: "noir",
    neon: "neon",
  };

  function getTheme(globeOrTerrainkKey) {
    const key = GLOBE_TO_TERRAINK[globeOrTerrainkKey] || globeOrTerrainkKey;
    return THEMES[key] || THEMES.terracotta;
  }

  /* ============================================================
   * 3. MapLibre style builder (ported from maplibreStyle.ts)
   * ============================================================ */

  const OPENFREEMAP_SOURCE = "https://tiles.openfreemap.org/planet";
  const SOURCE_ID = "openfreemap";
  const SOURCE_MAX_ZOOM = 14;
  const MAP_OVERZOOM_SCALE = 5.5;

  const BUILDING_BLEND_FACTOR = 0.14;
  const BUILDING_FILL_OPACITY = 0.84;
  const MAP_BUILDING_MIN_ZOOM_DEFAULT = 8;
  const MAP_BUILDING_MIN_ZOOM_PRESERVE = 8.2;
  const DETAIL_PRESERVE_DISTANCE_METERS = 30000;

  const MAP_WATERWAY_WIDTH_STOPS = [[0, 0.2], [6, 0.34], [12, 0.8], [18, 2.4]];
  const MAP_RAIL_WIDTH_STOPS = [[3, 0.4], [6, 0.7], [10, 1], [18, 1.5]];

  const MAP_ROAD_MAJOR_CLASSES = ["motorway"];
  const MAP_ROAD_MINOR_HIGH_CLASSES = [
    "primary", "primary_link", "secondary", "secondary_link",
    "motorway_link", "trunk", "trunk_link",
  ];
  const MAP_ROAD_MINOR_MID_CLASSES = ["tertiary", "tertiary_link", "minor"];
  const MAP_ROAD_MINOR_LOW_CLASSES = [
    "residential", "living_street", "unclassified", "road",
    "street", "street_limited", "service",
  ];
  const MAP_ROAD_PATH_CLASSES = ["path", "pedestrian", "cycleway", "track"];
  const MAP_RAIL_CLASSES = ["rail", "transit"];

  const MAP_ROAD_MINOR_HIGH_OVERVIEW_WIDTH_STOPS = [[0, 0.1], [4, 0.18], [8, 0.3], [11, 0.46]];
  const MAP_ROAD_MINOR_MID_OVERVIEW_WIDTH_STOPS = [[0, 0.08], [4, 0.14], [8, 0.24], [11, 0.36]];
  const MAP_ROAD_MINOR_LOW_OVERVIEW_WIDTH_STOPS = [[0, 0.06], [4, 0.1], [8, 0.18], [11, 0.3]];
  const MAP_ROAD_MINOR_HIGH_DETAIL_WIDTH_STOPS = [[6, 0.46], [10, 0.8], [14, 1.48], [18, 2.7]];
  const MAP_ROAD_MINOR_MID_DETAIL_WIDTH_STOPS = [[6, 0.34], [10, 0.62], [14, 1.2], [18, 2.35]];
  const MAP_ROAD_MINOR_LOW_DETAIL_WIDTH_STOPS = [[6, 0.24], [10, 0.44], [14, 0.84], [18, 1.65]];
  const MAP_ROAD_PATH_OVERVIEW_WIDTH_STOPS = [[5, 0.06], [8, 0.1], [11, 0.2]];
  const MAP_ROAD_PATH_DETAIL_WIDTH_STOPS = [[8, 0.2], [12, 0.42], [16, 0.85], [18, 1.3]];
  const MAP_ROAD_MAJOR_WIDTH_STOPS = [[0, 0.36], [3, 0.52], [9, 1.1], [14, 2.05], [18, 3.3]];

  const ROAD_MINOR_OVERVIEW_MIN_ZOOM = 0;
  const ROAD_MINOR_DETAIL_MIN_ZOOM = 6;
  const ROAD_PATH_OVERVIEW_MIN_ZOOM = 5;
  const ROAD_PATH_DETAIL_MIN_ZOOM = 8;
  const ROAD_OVERVIEW_MAX_ZOOM = 11.8;

  const LINE_GEOMETRY_FILTER = [
    "match", ["geometry-type"], ["LineString", "MultiLineString"], true, false,
  ];
  const OVERZOOM_LINE_WIDTH_SCALE = Math.pow(MAP_OVERZOOM_SCALE, 0.8);

  function resolveBuildingMinZoom(distanceMeters) {
    if (Number.isFinite(distanceMeters) && Number(distanceMeters) <= DETAIL_PRESERVE_DISTANCE_METERS) {
      return MAP_BUILDING_MIN_ZOOM_PRESERVE;
    }
    return MAP_BUILDING_MIN_ZOOM_DEFAULT;
  }
  function widthExpr(stops) {
    const flat = [].concat(...stops.map(([z, w]) => [z, w]));
    return ["interpolate", ["linear"], ["zoom"], ...flat];
  }
  function opacityExpr(stops) {
    const flat = [].concat(...stops.map(([z, o]) => [z, o]));
    return ["interpolate", ["linear"], ["zoom"], ...flat];
  }
  function scaledStops(stops, scale) { return stops.map(([z, w]) => [z, w * scale]); }
  function compensateLineWidthStops(stops) { return scaledStops(stops, OVERZOOM_LINE_WIDTH_SCALE); }
  function lineClassFilter(classes) {
    return ["all", LINE_GEOMETRY_FILTER, ["match", ["get", "class"], classes, true, false]];
  }

  function generateMapStyle(theme, options) {
    options = options || {};
    const buildingFill = theme.map.buildings ||
      blendHex(theme.map.land || "#ffffff", theme.ui.text || "#111111", BUILDING_BLEND_FACTOR);

    const includeLandcover = options.includeLandcover !== false;
    const includeBuildings = options.includeBuildings !== false;
    const includeWater = options.includeWater !== false;
    const includeParks = options.includeParks !== false;
    const includeAeroway = options.includeAeroway !== false;
    const includeRail = options.includeRail !== false;
    const includeRoads = options.includeRoads !== false;
    const includeRoadPath = options.includeRoadPath !== false;
    const includeRoadMinorLow = options.includeRoadMinorLow !== false;
    const includeRoadOutline = options.includeRoadOutline !== false;
    const buildingMinZoom = resolveBuildingMinZoom(options.distanceMeters);

    const minorHighCasingStops = scaledStops(MAP_ROAD_MINOR_HIGH_DETAIL_WIDTH_STOPS, 1.45);
    const minorMidCasingStops = scaledStops(MAP_ROAD_MINOR_MID_DETAIL_WIDTH_STOPS, 1.15);
    const pathCasingStops = scaledStops(MAP_ROAD_PATH_DETAIL_WIDTH_STOPS, 1.6);
    const majorCasingStops = scaledStops(MAP_ROAD_MAJOR_WIDTH_STOPS, 1.38);

    const waterwayWidthStops = compensateLineWidthStops(MAP_WATERWAY_WIDTH_STOPS);
    const railWidthStops = compensateLineWidthStops(MAP_RAIL_WIDTH_STOPS);
    const roadMinorOverviewHighWidthStops = compensateLineWidthStops(MAP_ROAD_MINOR_HIGH_OVERVIEW_WIDTH_STOPS);
    const roadMinorOverviewMidWidthStops = compensateLineWidthStops(MAP_ROAD_MINOR_MID_OVERVIEW_WIDTH_STOPS);
    const roadMinorOverviewLowWidthStops = compensateLineWidthStops(MAP_ROAD_MINOR_LOW_OVERVIEW_WIDTH_STOPS);
    const roadPathOverviewWidthStops = compensateLineWidthStops(MAP_ROAD_PATH_OVERVIEW_WIDTH_STOPS);
    const roadMinorDetailHighWidthStops = compensateLineWidthStops(MAP_ROAD_MINOR_HIGH_DETAIL_WIDTH_STOPS);
    const roadMinorDetailMidWidthStops = compensateLineWidthStops(MAP_ROAD_MINOR_MID_DETAIL_WIDTH_STOPS);
    const roadMinorDetailLowWidthStops = compensateLineWidthStops(MAP_ROAD_MINOR_LOW_DETAIL_WIDTH_STOPS);
    const roadPathDetailWidthStops = compensateLineWidthStops(MAP_ROAD_PATH_DETAIL_WIDTH_STOPS);
    const roadMajorWidthStops = compensateLineWidthStops(MAP_ROAD_MAJOR_WIDTH_STOPS);
    const roadMinorHighCasingStops = compensateLineWidthStops(minorHighCasingStops);
    const roadMinorMidCasingStops = compensateLineWidthStops(minorMidCasingStops);
    const roadPathCasingStops = compensateLineWidthStops(pathCasingStops);
    const roadMajorCasingStops = compensateLineWidthStops(majorCasingStops);

    const roadMinorHighColor = theme.map.roads.minor_high;
    const roadMinorMidColor = theme.map.roads.minor_mid;
    const roadMinorLowColor = theme.map.roads.minor_low;
    const roadPathColor = theme.map.roads.path;
    const roadOutlineColor = theme.map.roads.outline;
    const roadsVis = includeRoads ? "visible" : "none";

    return {
      version: 8,
      sources: {
        [SOURCE_ID]: { type: "vector", url: OPENFREEMAP_SOURCE, maxzoom: SOURCE_MAX_ZOOM },
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": theme.map.land } },
        {
          id: "landcover", source: SOURCE_ID, "source-layer": "landcover", type: "fill",
          layout: { visibility: includeLandcover ? "visible" : "none" },
          paint: { "fill-color": theme.map.landcover, "fill-opacity": 0.7 },
        },
        {
          id: "park", source: SOURCE_ID, "source-layer": "park", type: "fill",
          layout: { visibility: includeParks ? "visible" : "none" },
          paint: { "fill-color": theme.map.parks },
        },
        {
          id: "water", source: SOURCE_ID, "source-layer": "water", type: "fill",
          layout: { visibility: includeWater ? "visible" : "none" },
          paint: { "fill-color": theme.map.water },
        },
        {
          id: "waterway", source: SOURCE_ID, "source-layer": "waterway", type: "line",
          filter: lineClassFilter(["river", "canal", "stream", "ditch"]),
          paint: { "line-color": theme.map.waterway, "line-width": widthExpr(waterwayWidthStops) },
          layout: { visibility: includeWater ? "visible" : "none", "line-cap": "round", "line-join": "round" },
        },
        {
          id: "aeroway", source: SOURCE_ID, "source-layer": "aeroway", type: "fill",
          filter: ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
          layout: { visibility: includeAeroway ? "visible" : "none" },
          paint: { "fill-color": theme.map.aeroway, "fill-opacity": 0.85 },
        },
        {
          id: "building", source: SOURCE_ID, "source-layer": "building", type: "fill",
          minzoom: buildingMinZoom,
          layout: { visibility: includeBuildings ? "visible" : "none" },
          paint: { "fill-color": buildingFill, "fill-opacity": BUILDING_FILL_OPACITY },
        },
        {
          id: "rail", source: SOURCE_ID, "source-layer": "transportation", type: "line",
          filter: lineClassFilter(MAP_RAIL_CLASSES),
          paint: {
            "line-color": theme.map.rail,
            "line-width": widthExpr(railWidthStops),
            "line-opacity": opacityExpr([[0, 0.56], [12, 0.62], [18, 0.72]]),
            "line-dasharray": [2, 1.6],
          },
          layout: { visibility: includeRail ? "visible" : "none", "line-cap": "round", "line-join": "round" },
        },
        {
          id: "road-minor-overview-high", source: SOURCE_ID, "source-layer": "transportation", type: "line",
          minzoom: ROAD_MINOR_OVERVIEW_MIN_ZOOM, maxzoom: ROAD_OVERVIEW_MAX_ZOOM,
          filter: lineClassFilter(MAP_ROAD_MINOR_HIGH_CLASSES),
          paint: {
            "line-color": roadMinorHighColor,
            "line-width": widthExpr(roadMinorOverviewHighWidthStops),
            "line-opacity": opacityExpr([[0, 0.66], [8, 0.76], [12, 0]]),
          },
          layout: { visibility: roadsVis, "line-cap": "round", "line-join": "round" },
        },
        {
          id: "road-minor-overview-mid", source: SOURCE_ID, "source-layer": "transportation", type: "line",
          minzoom: ROAD_MINOR_OVERVIEW_MIN_ZOOM, maxzoom: ROAD_OVERVIEW_MAX_ZOOM,
          filter: lineClassFilter(MAP_ROAD_MINOR_MID_CLASSES),
          paint: {
            "line-color": roadMinorMidColor,
            "line-width": widthExpr(roadMinorOverviewMidWidthStops),
            "line-opacity": opacityExpr([[0, 0.46], [8, 0.56], [12, 0]]),
          },
          layout: { visibility: roadsVis, "line-cap": "round", "line-join": "round" },
        },
        {
          id: "road-minor-overview-low", source: SOURCE_ID, "source-layer": "transportation", type: "line",
          minzoom: ROAD_MINOR_OVERVIEW_MIN_ZOOM, maxzoom: ROAD_OVERVIEW_MAX_ZOOM,
          filter: lineClassFilter(MAP_ROAD_MINOR_LOW_CLASSES),
          paint: {
            "line-color": roadMinorLowColor,
            "line-width": widthExpr(roadMinorOverviewLowWidthStops),
            "line-opacity": includeRoadMinorLow
              ? opacityExpr([[0, 0.26], [8, 0.34], [12, 0]])
              : 0,
          },
          layout: { visibility: roadsVis, "line-cap": "round", "line-join": "round" },
        },
        {
          id: "road-path-overview", source: SOURCE_ID, "source-layer": "transportation", type: "line",
          minzoom: ROAD_PATH_OVERVIEW_MIN_ZOOM, maxzoom: ROAD_OVERVIEW_MAX_ZOOM,
          filter: lineClassFilter(MAP_ROAD_PATH_CLASSES),
          paint: {
            "line-color": roadPathColor,
            "line-width": widthExpr(roadPathOverviewWidthStops),
            "line-opacity": includeRoadPath
              ? opacityExpr([[5, 0.45], [9, 0.58], [12, 0]])
              : 0,
          },
          layout: { visibility: roadsVis, "line-cap": "round", "line-join": "round" },
        },
        {
          id: "road-major-casing", source: SOURCE_ID, "source-layer": "transportation", type: "line",
          filter: lineClassFilter(MAP_ROAD_MAJOR_CLASSES),
          paint: {
            "line-color": roadOutlineColor,
            "line-width": widthExpr(roadMajorCasingStops),
            "line-opacity": includeRoadOutline ? 0.95 : 0,
          },
          layout: { visibility: roadsVis, "line-cap": "round", "line-join": "round" },
        },
        {
          id: "road-minor-high-casing", source: SOURCE_ID, "source-layer": "transportation", type: "line",
          minzoom: ROAD_MINOR_DETAIL_MIN_ZOOM,
          filter: lineClassFilter(MAP_ROAD_MINOR_HIGH_CLASSES),
          paint: {
            "line-color": roadOutlineColor,
            "line-width": widthExpr(roadMinorHighCasingStops),
            "line-opacity": includeRoadOutline
              ? opacityExpr([[6, 0.72], [12, 0.85], [18, 0.92]])
              : 0,
          },
          layout: { visibility: roadsVis, "line-cap": "round", "line-join": "round" },
        },
        {
          id: "road-minor-mid-casing", source: SOURCE_ID, "source-layer": "transportation", type: "line",
          minzoom: ROAD_MINOR_DETAIL_MIN_ZOOM,
          filter: lineClassFilter(MAP_ROAD_MINOR_MID_CLASSES),
          paint: {
            "line-color": roadOutlineColor,
            "line-width": widthExpr(roadMinorMidCasingStops),
            "line-opacity": includeRoadOutline
              ? opacityExpr([[6, 0.42], [12, 0.56], [18, 0.66]])
              : 0,
          },
          layout: { visibility: roadsVis, "line-cap": "round", "line-join": "round" },
        },
        {
          id: "road-path-casing", source: SOURCE_ID, "source-layer": "transportation", type: "line",
          minzoom: ROAD_PATH_DETAIL_MIN_ZOOM,
          filter: lineClassFilter(MAP_ROAD_PATH_CLASSES),
          paint: {
            "line-color": roadOutlineColor,
            "line-width": widthExpr(roadPathCasingStops),
            "line-opacity": includeRoadOutline && includeRoadPath
              ? opacityExpr([[8, 0.62], [12, 0.72], [18, 0.85]])
              : 0,
          },
          layout: { visibility: roadsVis, "line-cap": "round", "line-join": "round" },
        },
        {
          id: "road-major", source: SOURCE_ID, "source-layer": "transportation", type: "line",
          filter: lineClassFilter(MAP_ROAD_MAJOR_CLASSES),
          paint: {
            "line-color": theme.map.roads.major,
            "line-width": widthExpr(roadMajorWidthStops),
          },
          layout: { visibility: roadsVis, "line-cap": "round", "line-join": "round" },
        },
        {
          id: "road-minor-high", source: SOURCE_ID, "source-layer": "transportation", type: "line",
          minzoom: ROAD_MINOR_DETAIL_MIN_ZOOM,
          filter: lineClassFilter(MAP_ROAD_MINOR_HIGH_CLASSES),
          paint: {
            "line-color": roadMinorHighColor,
            "line-width": widthExpr(roadMinorDetailHighWidthStops),
            "line-opacity": opacityExpr([[6, 0.84], [10, 0.92], [18, 1]]),
          },
          layout: { visibility: roadsVis, "line-cap": "round", "line-join": "round" },
        },
        {
          id: "road-minor-mid", source: SOURCE_ID, "source-layer": "transportation", type: "line",
          minzoom: ROAD_MINOR_DETAIL_MIN_ZOOM,
          filter: lineClassFilter(MAP_ROAD_MINOR_MID_CLASSES),
          paint: {
            "line-color": roadMinorMidColor,
            "line-width": widthExpr(roadMinorDetailMidWidthStops),
            "line-opacity": opacityExpr([[6, 0.62], [10, 0.74], [18, 0.86]]),
          },
          layout: { visibility: roadsVis, "line-cap": "round", "line-join": "round" },
        },
        {
          id: "road-minor-low", source: SOURCE_ID, "source-layer": "transportation", type: "line",
          minzoom: ROAD_MINOR_DETAIL_MIN_ZOOM,
          filter: lineClassFilter(MAP_ROAD_MINOR_LOW_CLASSES),
          paint: {
            "line-color": roadMinorLowColor,
            "line-width": widthExpr(roadMinorDetailLowWidthStops),
            "line-opacity": includeRoadMinorLow
              ? opacityExpr([[6, 0.34], [10, 0.46], [18, 0.58]])
              : 0,
          },
          layout: { visibility: roadsVis, "line-cap": "round", "line-join": "round" },
        },
        {
          id: "road-path", source: SOURCE_ID, "source-layer": "transportation", type: "line",
          minzoom: ROAD_PATH_DETAIL_MIN_ZOOM,
          filter: lineClassFilter(MAP_ROAD_PATH_CLASSES),
          paint: {
            "line-color": roadPathColor,
            "line-width": widthExpr(roadPathDetailWidthStops),
            "line-opacity": includeRoadPath
              ? opacityExpr([[8, 0.7], [12, 0.82], [18, 0.95]])
              : 0,
          },
          layout: { visibility: roadsVis, "line-cap": "round", "line-join": "round" },
        },
      ],
    };
  }

  /* ============================================================
   * 4. Canvas size resolution + PNG encoder with DPI chunk
   * ============================================================ */

  const OUTPUT_DPI = 300;
  const MAX_PIXELS = 8_500_000;
  const MAX_SIDE = 4096;

  function resolveCanvasSize(widthInches, heightInches) {
    const requestedWidth = Math.max(600, Math.round(widthInches * OUTPUT_DPI));
    const requestedHeight = Math.max(600, Math.round(heightInches * OUTPUT_DPI));
    const totalPixels = requestedWidth * requestedHeight;
    const areaFactor = totalPixels > MAX_PIXELS ? Math.sqrt(MAX_PIXELS / totalPixels) : 1;
    const maxSide = Math.max(requestedWidth, requestedHeight);
    const sideFactor = maxSide > MAX_SIDE ? MAX_SIDE / maxSide : 1;
    const factor = Math.min(areaFactor, sideFactor, 1);
    return {
      width: Math.max(600, Math.round(requestedWidth * factor)),
      height: Math.max(600, Math.round(requestedHeight * factor)),
      requestedWidth, requestedHeight, downscaleFactor: factor,
    };
  }

  function writeUint32BE(t, o, v) {
    t[o] = (v >>> 24) & 0xff; t[o + 1] = (v >>> 16) & 0xff;
    t[o + 2] = (v >>> 8) & 0xff; t[o + 3] = v & 0xff;
  }
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = (CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
    return (crc ^ 0xffffffff) >>> 0;
  }
  function buildPhysChunk(dpi) {
    const ppm = Math.max(1, Math.round(dpi / 0.0254));
    const length = 9;
    const chunk = new Uint8Array(4 + 4 + length + 4);
    const type = new TextEncoder().encode("pHYs");
    writeUint32BE(chunk, 0, length);
    chunk.set(type, 4);
    writeUint32BE(chunk, 8, ppm);
    writeUint32BE(chunk, 12, ppm);
    chunk[16] = 1;
    const crcBytes = new Uint8Array(4 + length);
    crcBytes.set(type, 0);
    crcBytes.set(chunk.slice(8, 8 + length), 4);
    writeUint32BE(chunk, 8 + length, crc32(crcBytes));
    return chunk;
  }
  function injectDpiChunk(pngBytes, dpi) {
    if (dpi <= 0 || !Number.isFinite(dpi) || pngBytes.length < 33) return pngBytes;
    const ihdrLength = (pngBytes[8] << 24) | (pngBytes[9] << 16) | (pngBytes[10] << 8) | pngBytes[11];
    const insertAt = 8 + 12 + ihdrLength;
    if (insertAt > pngBytes.length) return pngBytes;
    const physChunk = buildPhysChunk(dpi);
    const out = new Uint8Array(pngBytes.length + physChunk.length);
    out.set(pngBytes.slice(0, insertAt), 0);
    out.set(physChunk, insertAt);
    out.set(pngBytes.slice(insertAt), insertAt + physChunk.length);
    return out;
  }
  async function createPngBlob(canvas, dpi) {
    dpi = dpi == null ? OUTPUT_DPI : dpi;
    const base = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob failed")), "image/png");
    });
    const bytes = new Uint8Array(await base.arrayBuffer());
    const withDpi = injectDpiChunk(bytes, dpi);
    return new Blob([withDpi], { type: "image/png" });
  }

  /* ============================================================
   * 5. Typography + fades (poster overlay)
   * ============================================================ */

  const TEXT_DIMENSION_REFERENCE_PX = 3600;
  const TEXT_CITY_Y_RATIO = 0.845;
  const TEXT_DIVIDER_Y_RATIO = 0.875;
  const TEXT_COUNTRY_Y_RATIO = 0.9;
  const TEXT_COORDS_Y_RATIO = 0.93;
  const TEXT_EDGE_MARGIN_RATIO = 0.02;
  const CITY_TEXT_SHRINK_THRESHOLD = 10;
  const CITY_FONT_BASE_PX = 250;
  const CITY_FONT_MIN_PX = 110;
  const COUNTRY_FONT_BASE_PX = 92;
  const COORDS_FONT_BASE_PX = 58;
  const ATTRIBUTION_FONT_BASE_PX = 50;

  function isLatinScript(text) {
    if (!text) return true;
    let latinCount = 0, alphaCount = 0;
    for (const ch of text) {
      if (/[A-Za-z\u00C0-\u024F]/.test(ch)) { latinCount++; alphaCount++; }
      else if (/\p{L}/u.test(ch)) { alphaCount++; }
    }
    if (alphaCount === 0) return true;
    return latinCount / alphaCount > 0.8;
  }
  function formatCityLabel(city) {
    return isLatinScript(city) ? city.toUpperCase().split("").join("  ") : city;
  }
  function computeCityFontScale(city) {
    const len = Math.max(city.length, 1);
    if (len <= CITY_TEXT_SHRINK_THRESHOLD) return 1;
    return Math.max(CITY_FONT_MIN_PX / CITY_FONT_BASE_PX, CITY_TEXT_SHRINK_THRESHOLD / len);
  }
  function computeAttributionColor(textColor, landHex, showOverlay) {
    if (showOverlay) return textColor;
    const landRgb = parseHex(landHex);
    const luma = landRgb ? (0.2126 * landRgb.r + 0.7152 * landRgb.g + 0.0722 * landRgb.b) / 255 : 0.5;
    return luma < 0.52 ? "#f5faff" : "#0e1822";
  }
  function formatCoordinates(lat, lon) {
    const ns = lat >= 0 ? "N" : "S";
    const ew = lon >= 0 ? "E" : "W";
    return Math.abs(lat).toFixed(4) + "° " + ns + " / " + Math.abs(lon).toFixed(4) + "° " + ew;
  }

  function applyFades(ctx, width, height, color) {
    const top = ctx.createLinearGradient(0, 0, 0, height * 0.25);
    top.addColorStop(0, withAlpha(color, 1));
    top.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, width, height * 0.25);
    const bottom = ctx.createLinearGradient(0, height, 0, height * 0.75);
    bottom.addColorStop(0, withAlpha(color, 1));
    bottom.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = bottom;
    ctx.fillRect(0, height * 0.75, width, height * 0.25);
  }

  function drawPosterText(ctx, width, height, theme, center, city, country, fontFamily, showPosterText, showOverlay, includeCredits, creditText) {
    const textColor = (theme.ui && theme.ui.text) || "#111111";
    const landColor = (theme.map && theme.map.land) || "#808080";
    const attrColor = computeAttributionColor(textColor, landColor, showOverlay);
    const attrAlpha = showOverlay ? 0.55 : 0.9;
    const titleFont = fontFamily ? `"${fontFamily}", "Space Grotesk", sans-serif` : `"Space Grotesk", sans-serif`;
    const bodyFont = fontFamily ? `"${fontFamily}", "IBM Plex Mono", monospace` : `"IBM Plex Mono", monospace`;

    const dimScale = Math.max(0.45, Math.min(width, height) / TEXT_DIMENSION_REFERENCE_PX);
    const attrSize = ATTRIBUTION_FONT_BASE_PX * dimScale;

    if (showPosterText) {
      const cityLabel = formatCityLabel(city);
      const citySize = CITY_FONT_BASE_PX * dimScale * computeCityFontScale(city);
      const countrySize = COUNTRY_FONT_BASE_PX * dimScale;
      const coordSize = COORDS_FONT_BASE_PX * dimScale;
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${citySize}px ${titleFont}`;
      ctx.fillText(cityLabel, width * 0.5, height * TEXT_CITY_Y_RATIO);

      ctx.strokeStyle = textColor;
      ctx.lineWidth = 3 * dimScale;
      ctx.beginPath();
      ctx.moveTo(width * 0.4, height * TEXT_DIVIDER_Y_RATIO);
      ctx.lineTo(width * 0.6, height * TEXT_DIVIDER_Y_RATIO);
      ctx.stroke();

      ctx.font = `300 ${countrySize}px ${titleFont}`;
      ctx.fillText(country.toUpperCase(), width * 0.5, height * TEXT_COUNTRY_Y_RATIO);

      ctx.globalAlpha = 0.75;
      ctx.font = `400 ${coordSize}px ${bodyFont}`;
      ctx.fillText(formatCoordinates(center.lat, center.lon), width * 0.5, height * TEXT_COORDS_Y_RATIO);
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = attrColor;
    ctx.globalAlpha = attrAlpha;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.font = `300 ${attrSize}px ${bodyFont}`;
    ctx.fillText("© OpenStreetMap contributors", width * (1 - TEXT_EDGE_MARGIN_RATIO), height * (1 - TEXT_EDGE_MARGIN_RATIO));
    ctx.globalAlpha = 1;

    if (includeCredits) {
      ctx.fillStyle = attrColor;
      ctx.globalAlpha = attrAlpha;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.font = `300 ${attrSize}px ${bodyFont}`;
      ctx.fillText(creditText || "Powered by Terraink · terraink.app", width * TEXT_EDGE_MARGIN_RATIO, height * (1 - TEXT_EDGE_MARGIN_RATIO));
      ctx.globalAlpha = 1;
    }
  }

  async function compositeExport(mapCanvas, options) {
    const { theme, center, displayCity, displayCountry, fontFamily,
      showPosterText = true, showOverlay = true, includeCredits = true, creditText } = options;
    const width = mapCanvas.width, height = mapCanvas.height;
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable.");
    ctx.drawImage(mapCanvas, 0, 0);
    if (showOverlay) applyFades(ctx, width, height, theme.ui.bg);
    drawPosterText(ctx, width, height, theme, center, displayCity, displayCountry, fontFamily, showPosterText, showOverlay, includeCredits, creditText);
    return { canvas };
  }

  /* ============================================================
   * 6. Offscreen MapLibre capture
   * ============================================================ */

  const EXPORT_MAP_TIMEOUT_MS = 20000;

  function waitForMapIdle(map) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Timed out waiting for tiles to render."));
      }, EXPORT_MAP_TIMEOUT_MS);
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      if (map.loaded() && !map.isMoving()) { finish(); return; }
      map.once("idle", finish);
    });
  }
  function createOffscreenContainer(width, height) {
    const el = document.createElement("div");
    el.style.position = "fixed";
    el.style.left = "-100000px";
    el.style.top = "0";
    el.style.width = width + "px";
    el.style.height = height + "px";
    el.style.pointerEvents = "none";
    el.style.opacity = "0";
    return el;
  }

  async function captureMapAsCanvas(center, zoom, style, exportWidth, exportHeight) {
    if (typeof maplibregl === "undefined") {
      throw new Error("maplibre-gl is not loaded. Include it before poster.js.");
    }
    const container = createOffscreenContainer(exportWidth, exportHeight);
    document.body.appendChild(container);
    const map = new maplibregl.Map({
      container, style,
      center: [center.lng, center.lat],
      zoom, pitch: 0, bearing: 0,
      interactive: false,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    try {
      await waitForMapIdle(map);
      // Wait one frame so the final tile set is rasterized to the GL canvas.
      await new Promise((r) => requestAnimationFrame(() => r()));
      const glCanvas = map.getCanvas();
      const out = document.createElement("canvas");
      out.width = exportWidth; out.height = exportHeight;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("Could not create 2D context for export canvas.");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(glCanvas, 0, 0, exportWidth, exportHeight);
      return out;
    } finally {
      map.remove();
      container.remove();
    }
  }

  /* ============================================================
   * 7. Geocoder (Nominatim) + zoom heuristic
   * ============================================================ */

  const geocodeCache = new Map();

  async function geocodeCity(city, country) {
    const key = (city + "|" + country).toLowerCase().trim();
    if (geocodeCache.has(key)) return geocodeCache.get(key);
    const q = encodeURIComponent([city, country].filter(Boolean).join(", "));
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${q}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Nominatim error ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`No coordinates found for "${city}, ${country}"`);
    }
    const hit = data[0];
    const coords = { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), displayName: hit.display_name };
    geocodeCache.set(key, coords);
    return coords;
  }

  /* ============================================================
   * 8. Filename + download
   * ============================================================ */

  function slugify(v) {
    const s = String(v == null ? "" : v).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return s || "untitled";
  }
  function createTimestamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }
  function createPosterFilename(city, themeId, ext) {
    return `${slugify(city) || "city"}_${themeId}_${createTimestamp()}.${(ext || "png").toLowerCase()}`;
  }
  function downloadBlob(blob, filename) {
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  /* ============================================================
   * 9. Public API
   * ============================================================ */

  async function generate(opts) {
    const { city, country, globeThemeKey } = opts;
    if (!city) throw new Error("generate() requires a city.");
    const terrainkKey = GLOBE_TO_TERRAINK[globeThemeKey] || globeThemeKey || "terracotta";
    const theme = THEMES[terrainkKey] || THEMES.terracotta;

    let lat = opts.lat, lon = opts.lon;
    if (lat == null || lon == null) {
      const loc = await geocodeCity(city, country || "");
      lat = loc.lat; lon = loc.lon;
    }

    const widthInches = opts.widthInches || 18;
    const heightInches = opts.heightInches || 24;
    const size = resolveCanvasSize(widthInches, heightInches);
    const zoom = opts.zoom != null ? opts.zoom : 12;

    const style = generateMapStyle(theme, { distanceMeters: 10000 });
    const mapCanvas = await captureMapAsCanvas(
      { lat, lng: lon }, zoom, style, size.width, size.height,
    );
    const { canvas } = await compositeExport(mapCanvas, {
      theme,
      center: { lat, lon },
      widthInches, heightInches,
      displayCity: city,
      displayCountry: country || "",
      fontFamily: opts.fontFamily || "Fraunces",
      showPosterText: true, showOverlay: true, includeCredits: true,
      creditText: opts.creditText,
    });
    const blob = await createPngBlob(canvas, OUTPUT_DPI);
    const filename = createPosterFilename(city, globeThemeKey || terrainkKey);
    downloadBlob(blob, filename);
    return { filename, width: canvas.width, height: canvas.height };
  }

  window.Poster = { generate, THEMES, GLOBE_TO_TERRAINK, getTheme, geocodeCity, generateMapStyle };
})();
