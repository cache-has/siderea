/**
 * Reactive HUD state for the Siderea UI overlay.
 *
 * Uses Svelte 5 runes ($state) for fine-grained reactivity.
 * The page component reads this state to drive renderer calls
 * (setSizeExaggeration, setVisible, etc.) and display info.
 */

import type { NotableStar, BlackholeNO, NebulaNO, ClusterNO, SolarSystemBody, Satellite } from '$lib/data/types';
import { CameraMode } from '$lib/renderer/camera-controller';
import { WarpPhase } from '$lib/renderer/warp-controller';
import type { TransferPlan } from '$lib/renderer/transfer-orbit';
import type { LightPathWasmResult } from '$lib/renderer/light-path-renderer';

/** Light path info displayed in the overlay. */
export interface LightPathInfo {
	/** Source object name. */
	sourceName: string;
	/** Source position in AU (near-scene coords). */
	sourcePositionAU: [number, number, number];
	/** WASM result with path data. */
	result: LightPathWasmResult;
}

/** State of the transfer flight. */
export type TransferFlightState = 'idle' | 'planning' | 'flying' | 'arrived';

/** A visited object in the breadcrumb trail. */
export interface BreadcrumbEntry {
	/** Display name. */
	name: string;
	/** Object kind for icon/color. */
	kind: 'body' | 'satellite' | 'star' | 'blackhole' | 'nebula' | 'cluster';
	/** Target position in near-scene coordinates (AU). */
	position: [number, number, number];
	/** Object radius in AU (0 for point targets). */
	radius: number;
}

const MAX_BREADCRUMBS = 20;

/** Visibility categories that can be independently toggled. */
export interface OrbitVisibility {
	planets: boolean;
	dwarfPlanets: boolean;
	comets: boolean;
	smallBodies: boolean;
	moons: boolean;
}

export interface BeltVisibility {
	asteroidBelt: boolean;
	kuiperBelt: boolean;
}

export interface GalacticVisibility {
	milkyWay: boolean;
	galacticPlane: boolean;
	galacticCenter: boolean;
	scaleMarkers: boolean;
	constellations: boolean;
}

/** Exaggeration presets: "visible" uses the default 200x, "real" uses 1x. */
export type SizeMode = 'visible' | 'real';

const DEFAULT_EXAGGERATION = 200;
const REAL_EXAGGERATION = 1;

export const SIZE_EXAGGERATION_VALUES: Record<SizeMode, number> = {
	visible: DEFAULT_EXAGGERATION,
	real: REAL_EXAGGERATION
};

/** Create a new HUD state instance. Call once in +page.svelte. */
export function createHudState() {
	let sizeMode = $state<SizeMode>('visible');
	let orbitVisibility = $state<OrbitVisibility>({
		planets: true,
		dwarfPlanets: true,
		comets: true,
		smallBodies: true,
		moons: true
	});
	let beltVisibility = $state<BeltVisibility>({
		asteroidBelt: true,
		kuiperBelt: true
	});
	let galacticVisibility = $state<GalacticVisibility>({
		milkyWay: true,
		galacticPlane: false,
		galacticCenter: true,
		scaleMarkers: false,
		constellations: false
	});
	let cameraDistance = $state(0);
	let cameraMode = $state<CameraMode>(CameraMode.ORBIT);
	let hudVisible = $state(true);
	let selectedStar = $state<NotableStar | null>(null);
	let selectedBlackhole = $state<BlackholeNO | null>(null);
	let selectedNebula = $state<NebulaNO | null>(null);
	let selectedCluster = $state<ClusterNO | null>(null);
	let selectedBody = $state<SolarSystemBody | null>(null);
	let selectedSatellite = $state<Satellite | null>(null);

	// Target tracking — position of whatever is selected (near-scene AU coords)
	let targetPosition = $state<[number, number, number] | null>(null);
	let targetRadius = $state(0);
	let targetDistance = $state<number | null>(null);

	// Breadcrumb trail — history of visited objects
	let breadcrumbs = $state<BreadcrumbEntry[]>([]);

	// Search panel visibility
	let searchVisible = $state(false);

	// Warp state
	let warpPhase = $state<WarpPhase>(WarpPhase.IDLE);
	let warpProgress = $state(0);
	let warpTargetName = $state<string | null>(null);

	// Transfer planning state
	let transferPanelVisible = $state(false);
	let transferPlan = $state<TransferPlan | null>(null);
	let transferFlightState = $state<TransferFlightState>('idle');
	let transferProgress = $state(0); // 0-1 during flight

	// Navigation HUD state
	let nearestBodyName = $state<string | null>(null);
	let nearestBodyDistance = $state<number | null>(null);
	let cameraSpeed = $state(0); // AU/s
	let compassHeading = $state<{
		galacticNorthAlt: number; // altitude angle to galactic north pole (-90 to 90)
		galacticCenterAz: number; // azimuth angle to galactic center (-180 to 180)
		eclipticNorthAlt: number; // altitude angle to ecliptic north (-90 to 90)
	}>({ galacticNorthAlt: 0, galacticCenterAz: 0, eclipticNorthAlt: 0 });

	// Distance labels overlay (between solar system objects)
	let distanceLabelsVisible = $state(false);

	// Probe trajectory visibility
	let probeTrajectoryVisible = $state(true);

	// Light path mode
	let lightPathVisible = $state(false);
	let lightPathSource = $state<string | null>(null);
	let lightPathInfo = $state<LightPathInfo | null>(null);
	let lightPathDrawing = $state(false); // true during draw-in animation

	// Info panel compact mode (user preference, persists across selections)
	let infoPanelCompact = $state(false);

	// Geodesic explorer mode (interactive black hole geodesic visualization)
	let geodesicExplorerActive = $state(false);
	let geodesicImpactParam = $state(1.5); // ratio to critical impact parameter

	// Approach detection state
	let approachTarget = $state<string | null>(null);
	let approachVisible = $state(false);
	let _approachTimer: ReturnType<typeof setTimeout> | null = null;

	// Coordinate display (toggleable via keyboard shortcut)
	let coordinateDisplayVisible = $state(false);
	let coordinates = $state<{
		/** Right ascension in radians (0 to 2π). */
		ra: number;
		/** Declination in radians (-π/2 to π/2). */
		dec: number;
		/** Galactic longitude in radians. */
		galLon: number;
		/** Galactic latitude in radians (-π/2 to π/2). */
		galLat: number;
		/** Ecliptic longitude in radians. */
		eclLon: number;
		/** Ecliptic latitude in radians (-π/2 to π/2). */
		eclLat: number;
	}>({ ra: 0, dec: 0, galLon: 0, galLat: 0, eclLon: 0, eclLat: 0 });

	// Time control state (reactive mirrors of SimulationClock)
	let simTimeScale = $state(1);
	let simDateString = $state('');
	let simPaused = $state(false);

	return {
		get sizeMode() { return sizeMode; },
		set sizeMode(v: SizeMode) { sizeMode = v; },

		get sizeExaggeration() { return SIZE_EXAGGERATION_VALUES[sizeMode]; },

		get orbitVisibility() { return orbitVisibility; },
		set orbitVisibility(v: OrbitVisibility) { orbitVisibility = v; },

		get beltVisibility() { return beltVisibility; },
		set beltVisibility(v: BeltVisibility) { beltVisibility = v; },

		/** Distance from camera to orbit target in AU. Updated per frame. */
		get cameraDistance() { return cameraDistance; },
		set cameraDistance(v: number) { cameraDistance = v; },

		/** Current camera mode. Updated per frame. */
		get cameraMode() { return cameraMode; },
		set cameraMode(v: CameraMode) { cameraMode = v; },

		/** Toggle entire HUD visibility (keyboard shortcut). */
		get hudVisible() { return hudVisible; },
		set hudVisible(v: boolean) { hudVisible = v; },

		/** Toggle a specific orbit category. */
		toggleOrbitCategory(category: keyof OrbitVisibility) {
			orbitVisibility = { ...orbitVisibility, [category]: !orbitVisibility[category] };
		},

		/** Toggle a specific belt. */
		toggleBelt(belt: keyof BeltVisibility) {
			beltVisibility = { ...beltVisibility, [belt]: !beltVisibility[belt] };
		},

		get galacticVisibility() { return galacticVisibility; },
		set galacticVisibility(v: GalacticVisibility) { galacticVisibility = v; },

		/** Toggle a specific galactic overlay. */
		toggleGalactic(layer: keyof GalacticVisibility) {
			galacticVisibility = { ...galacticVisibility, [layer]: !galacticVisibility[layer] };
		},

		/** Toggle size mode between 'visible' and 'real'. */
		toggleSizeMode() {
			sizeMode = sizeMode === 'visible' ? 'real' : 'visible';
		},

		/** Currently selected notable star (shown in info panel). */
		get selectedStar() { return selectedStar; },
		set selectedStar(v: NotableStar | null) { selectedStar = v; },

		/** Select a star for the info panel. */
		selectStar(star: NotableStar) {
			selectedBlackhole = null;
			selectedNebula = null;
			selectedCluster = null;
			selectedBody = null;
			selectedSatellite = null;
			selectedStar = star;
		},

		/** Deselect / close the star info panel. */
		deselectStar() {
			selectedStar = null;
		},

		/** Currently selected black hole (shown in info panel). */
		get selectedBlackhole() { return selectedBlackhole; },
		set selectedBlackhole(v: BlackholeNO | null) { selectedBlackhole = v; },

		/** Select a black hole for the info panel. */
		selectBlackhole(bh: BlackholeNO) {
			selectedStar = null;
			selectedNebula = null;
			selectedCluster = null;
			selectedBody = null;
			selectedSatellite = null;
			selectedBlackhole = bh;
		},

		/** Deselect / close the black hole info panel. */
		deselectBlackhole() {
			selectedBlackhole = null;
			geodesicExplorerActive = false;
			geodesicImpactParam = 1.5;
		},

		/** Currently selected nebula (shown in info panel). */
		get selectedNebula() { return selectedNebula; },
		set selectedNebula(v: NebulaNO | null) { selectedNebula = v; },

		/** Select a nebula for the info panel. */
		selectNebula(neb: NebulaNO) {
			selectedStar = null;
			selectedBlackhole = null;
			selectedCluster = null;
			selectedBody = null;
			selectedSatellite = null;
			selectedNebula = neb;
		},

		/** Deselect / close the nebula info panel. */
		deselectNebula() {
			selectedNebula = null;
		},

		/** Currently selected star cluster (shown in info panel). */
		get selectedCluster() { return selectedCluster; },
		set selectedCluster(v: ClusterNO | null) { selectedCluster = v; },

		/** Select a star cluster for the info panel. */
		selectCluster(cluster: ClusterNO) {
			selectedStar = null;
			selectedBlackhole = null;
			selectedNebula = null;
			selectedBody = null;
			selectedSatellite = null;
			selectedCluster = cluster;
		},

		/** Deselect / close the cluster info panel. */
		deselectCluster() {
			selectedCluster = null;
		},

		// --- Solar system body selection ---

		/** Currently selected solar system body (planet, moon, etc.). */
		get selectedBody() { return selectedBody; },
		set selectedBody(v: SolarSystemBody | null) { selectedBody = v; },

		/** Select a solar system body for the info panel. */
		selectBody(body: SolarSystemBody, position: [number, number, number], radius: number) {
			selectedStar = null;
			selectedBlackhole = null;
			selectedNebula = null;
			selectedCluster = null;
			selectedSatellite = null;
			selectedBody = body;
			targetPosition = position;
			targetRadius = radius;
		},

		/** Deselect / close the body info panel. */
		deselectBody() {
			selectedBody = null;
			targetPosition = null;
			targetRadius = 0;
		},

		/** Currently selected satellite. */
		get selectedSatellite() { return selectedSatellite; },
		set selectedSatellite(v: Satellite | null) { selectedSatellite = v; },

		/** Select a satellite for the info panel. */
		selectSatellite(sat: Satellite, position: [number, number, number]) {
			selectedStar = null;
			selectedBlackhole = null;
			selectedNebula = null;
			selectedCluster = null;
			selectedBody = null;
			selectedSatellite = sat;
			targetPosition = position;
			targetRadius = 0;
		},

		/** Deselect / close the satellite info panel. */
		deselectSatellite() {
			selectedSatellite = null;
			targetPosition = null;
			targetRadius = 0;
		},

		// --- Target tracking ---

		/** Position of the currently targeted object (AU coords), null if none. */
		get targetPosition() { return targetPosition; },
		set targetPosition(v: [number, number, number] | null) { targetPosition = v; },

		/** Radius of target object in AU. */
		get targetRadius() { return targetRadius; },
		set targetRadius(v: number) { targetRadius = v; },

		/** Distance from camera to target in AU, updated per frame. */
		get targetDistance() { return targetDistance; },
		set targetDistance(v: number | null) { targetDistance = v; },

		/** Whether any object is currently selected/targeted. */
		get hasTarget() {
			return !!(selectedBody || selectedSatellite || selectedStar || selectedBlackhole || selectedNebula || selectedCluster);
		},

		/** Name of the currently selected target, or null. */
		get targetName(): string | null {
			if (selectedBody) return selectedBody.name;
			if (selectedSatellite) return selectedSatellite.name;
			if (selectedStar) return selectedStar.name;
			if (selectedBlackhole) return selectedBlackhole.name;
			if (selectedNebula) return selectedNebula.name;
			if (selectedCluster) return selectedCluster.name;
			return null;
		},

		/** Deselect everything. */
		deselectAll() {
			selectedStar = null;
			selectedBlackhole = null;
			selectedNebula = null;
			selectedCluster = null;
			selectedBody = null;
			selectedSatellite = null;
			geodesicExplorerActive = false;
			geodesicImpactParam = 1.5;
			targetPosition = null;
			targetRadius = 0;
			targetDistance = null;
		},

		// --- Breadcrumb trail ---

		/** History of visited objects. */
		get breadcrumbs() { return breadcrumbs; },

		/** Push a visited object onto the breadcrumb trail. */
		pushBreadcrumb(entry: BreadcrumbEntry) {
			// Don't push duplicate of most recent
			const last = breadcrumbs[breadcrumbs.length - 1];
			if (last && last.name === entry.name && last.kind === entry.kind) return;
			breadcrumbs = [...breadcrumbs, entry].slice(-MAX_BREADCRUMBS);
		},

		/** Pop and return the last breadcrumb (for back navigation). */
		popBreadcrumb(): BreadcrumbEntry | undefined {
			if (breadcrumbs.length === 0) return undefined;
			const last = breadcrumbs[breadcrumbs.length - 1];
			breadcrumbs = breadcrumbs.slice(0, -1);
			return last;
		},

		/** Clear all breadcrumbs. */
		clearBreadcrumbs() {
			breadcrumbs = [];
		},

		// --- Search panel ---

		/** Whether the search panel is visible. */
		get searchVisible() { return searchVisible; },
		set searchVisible(v: boolean) { searchVisible = v; },

		/** Toggle search panel visibility. */
		toggleSearch() {
			searchVisible = !searchVisible;
		},

		// --- Warp state ---

		/** Current warp phase (idle when not warping). */
		get warpPhase() { return warpPhase; },
		set warpPhase(v: WarpPhase) { warpPhase = v; },

		/** Warp progress 0→1. */
		get warpProgress() { return warpProgress; },
		set warpProgress(v: number) { warpProgress = v; },

		/** Name of the warp destination. */
		get warpTargetName() { return warpTargetName; },
		set warpTargetName(v: string | null) { warpTargetName = v; },

		/** Whether a warp is currently in progress. */
		get isWarping() { return warpPhase !== WarpPhase.IDLE; },

		// --- Transfer planning ---

		/** Whether the transfer planning panel is visible. */
		get transferPanelVisible() { return transferPanelVisible; },
		set transferPanelVisible(v: boolean) { transferPanelVisible = v; },

		/** Toggle transfer panel visibility. */
		toggleTransferPanel() {
			transferPanelVisible = !transferPanelVisible;
		},

		/** Current transfer plan (null if none). */
		get transferPlan() { return transferPlan; },
		set transferPlan(v: TransferPlan | null) { transferPlan = v; },

		/** Current transfer flight state. */
		get transferFlightState() { return transferFlightState; },
		set transferFlightState(v: TransferFlightState) { transferFlightState = v; },

		/** Transfer flight progress 0-1. */
		get transferProgress() { return transferProgress; },
		set transferProgress(v: number) { transferProgress = v; },

		/** Whether a transfer flight is active. */
		get isTransferFlying() { return transferFlightState === 'flying'; },

		/** Clear all transfer state. */
		clearTransfer() {
			transferPlan = null;
			transferFlightState = 'idle';
			transferProgress = 0;
		},

		// --- Navigation HUD ---

		/** Name of the nearest solar system body. */
		get nearestBodyName() { return nearestBodyName; },
		set nearestBodyName(v: string | null) { nearestBodyName = v; },

		/** Distance to nearest body in AU. */
		get nearestBodyDistance() { return nearestBodyDistance; },
		set nearestBodyDistance(v: number | null) { nearestBodyDistance = v; },

		/** Camera speed in AU/s (for free-fly velocity display). */
		get cameraSpeed() { return cameraSpeed; },
		set cameraSpeed(v: number) { cameraSpeed = v; },

		/** Compass orientation angles. */
		get compassHeading() { return compassHeading; },
		set compassHeading(v: typeof compassHeading) { compassHeading = v; },

		// --- Approach detection ---

		/** Name of the object currently being approached (for toast display). */
		get approachTarget() { return approachTarget; },

		/** Whether the approach toast is visible. */
		get approachVisible() { return approachVisible; },

		/** Show the approach toast for a given object name. Auto-hides after duration. */
		showApproach(name: string, durationMs = 3000) {
			if (_approachTimer) clearTimeout(_approachTimer);
			approachTarget = name;
			approachVisible = true;
			_approachTimer = setTimeout(() => {
				approachVisible = false;
				_approachTimer = null;
			}, durationMs);
		},

		/** Immediately hide the approach toast. */
		hideApproach() {
			if (_approachTimer) { clearTimeout(_approachTimer); _approachTimer = null; }
			approachVisible = false;
		},

		// --- Coordinate display ---

		/** Whether the coordinate display is visible. */
		get coordinateDisplayVisible() { return coordinateDisplayVisible; },
		set coordinateDisplayVisible(v: boolean) { coordinateDisplayVisible = v; },

		/** Toggle coordinate display visibility. */
		toggleCoordinateDisplay() {
			coordinateDisplayVisible = !coordinateDisplayVisible;
		},

		/** Current camera look-direction coordinates in all three systems. */
		get coordinates() { return coordinates; },
		set coordinates(v: typeof coordinates) { coordinates = v; },

		// --- Time controls ---

		/** Current simulation time scale (mirror of SimulationClock). */
		get simTimeScale() { return simTimeScale; },
		set simTimeScale(v: number) { simTimeScale = v; },

		/** Current simulation date string. */
		get simDateString() { return simDateString; },
		set simDateString(v: string) { simDateString = v; },

		/** Whether simulation is paused. */
		get simPaused() { return simPaused; },
		set simPaused(v: boolean) { simPaused = v; },

		// --- Probe trajectories ---

		/** Whether probe trajectory lines are visible. */
		get probeTrajectoryVisible() { return probeTrajectoryVisible; },
		set probeTrajectoryVisible(v: boolean) { probeTrajectoryVisible = v; },

		/** Toggle probe trajectory visibility. */
		toggleProbeTrajectories() {
			probeTrajectoryVisible = !probeTrajectoryVisible;
		},

		// --- Distance labels ---

		/** Whether distance labels between objects are visible. */
		get distanceLabelsVisible() { return distanceLabelsVisible; },
		set distanceLabelsVisible(v: boolean) { distanceLabelsVisible = v; },

		/** Toggle distance labels on/off. */
		toggleDistanceLabels() {
			distanceLabelsVisible = !distanceLabelsVisible;
		},

		// --- Light path mode ---

		/** Whether light path visualization is active. */
		get lightPathVisible() { return lightPathVisible; },
		set lightPathVisible(v: boolean) { lightPathVisible = v; },

		/** Name of the current light path source (star/object name). */
		get lightPathSource() { return lightPathSource; },
		set lightPathSource(v: string | null) { lightPathSource = v; },

		/** Light path computation result and source info for the overlay. */
		get lightPathInfo() { return lightPathInfo; },
		set lightPathInfo(v: LightPathInfo | null) { lightPathInfo = v; },

		/** Whether the path draw-in animation is active. */
		get lightPathDrawing() { return lightPathDrawing; },
		set lightPathDrawing(v: boolean) { lightPathDrawing = v; },

		/** Toggle light path mode on/off. */
		toggleLightPath() {
			lightPathVisible = !lightPathVisible;
			if (!lightPathVisible) {
				lightPathSource = null;
				lightPathInfo = null;
				lightPathDrawing = false;
			}
		},

		/** Activate a light path from a named source. */
		activateLightPath(sourceName: string, sourcePositionAU: [number, number, number], result: LightPathWasmResult) {
			lightPathVisible = true;
			lightPathSource = sourceName;
			lightPathDrawing = true;
			lightPathInfo = { sourceName, sourcePositionAU, result };
		},

		/** Clear the active light path. */
		clearLightPath() {
			lightPathVisible = false;
			lightPathSource = null;
			lightPathInfo = null;
			lightPathDrawing = false;
		},

		// --- Info panel compact mode ---

		/** Whether info panels are in compact (minimized) mode. */
		get infoPanelCompact() { return infoPanelCompact; },
		set infoPanelCompact(v: boolean) { infoPanelCompact = v; },

		/** Toggle info panel compact mode. */
		toggleInfoPanelCompact() {
			infoPanelCompact = !infoPanelCompact;
		},

		// --- Geodesic explorer mode ---

		/** Whether the geodesic explorer is active. */
		get geodesicExplorerActive() { return geodesicExplorerActive; },
		set geodesicExplorerActive(v: boolean) { geodesicExplorerActive = v; },

		/** Impact parameter as ratio to critical (0.3 = deep capture, 5.0 = wide deflection). */
		get geodesicImpactParam() { return geodesicImpactParam; },
		set geodesicImpactParam(v: number) { geodesicImpactParam = v; },

		/** Toggle geodesic explorer on/off. Requires a selected black hole. */
		toggleGeodesicExplorer() {
			if (!selectedBlackhole) return;
			geodesicExplorerActive = !geodesicExplorerActive;
			if (!geodesicExplorerActive) geodesicImpactParam = 1.5;
		},

		/** Close the geodesic explorer. */
		closeGeodesicExplorer() {
			geodesicExplorerActive = false;
			geodesicImpactParam = 1.5;
		}
	};
}

export type HudState = ReturnType<typeof createHudState>;
