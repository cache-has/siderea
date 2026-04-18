<script lang="ts">
	import { onMount } from 'svelte';
	import {
		PlaneGeometry,
		MeshBasicMaterial,
		Mesh,
		Vector3,
		Raycaster,
		Vector2,
		Group
	} from 'three/webgpu';
	import {
		SidereaRenderer,
		CameraMode,
		StarFieldRenderer,
		StarLabelRenderer,
		SolarSystemLighting,
		SunRenderer,
		PlanetRenderer,
		DwarfPlanetRenderer,
		CometRenderer,
		OrbitPathRenderer,
		RingRenderer,
		MoonRenderer,
		MoonOrbitPathRenderer,
		BeltRenderer,
		SmallBodyRenderer,
		SatelliteRenderer,
		loadSnapshotTles,
		ProbeTrajectoryRenderer,
		AtmosphereRenderer,
		BlackholeRenderer,
		BlackholeLabelRenderer,
		NebulaRenderer,
		NebulaLabelRenderer,
		ClusterRenderer,
		ClusterLabelRenderer,
		MilkyWayRenderer,
		GalacticGridRenderer,
		ConstellationRenderer,
		GalacticIndicatorRenderer,
		ScaleMarkerRenderer,
		WarpEffects,
		WarpPhase,
		SelectionHighlight,
		TransferOrbitRenderer,
		LightPathRenderer,
		GeodesicExplorerRenderer,
		FramePositionCache,
		dateToJD,
		cameraDistanceToMagCutoff,
		computeDarkAdaptation,
		smoothAdaptation,
		METERS_PER_AU,
		AU_PER_PARSEC,
		GALACTIC_NORTH_POLE,
		GALACTIC_CENTER_DIR,
		ECLIPTIC_NORTH_POLE,
		galacticLatitude,
		galacticLongitude,
		eclipticLatitude,
		eclipticLongitude
	} from '$lib/renderer';
	import type { TransferPlan, HohmannResult, WasmLightPath, ActiveGeodesicInfo, WarpObstacle } from '$lib/renderer';
	import type { BlackHoleGeometryResult } from '$lib/renderer/light-path-renderer';
	import { DistanceLabelRenderer, meshPositionGetter, originPositionGetter } from '$lib/renderer/distance-labels';
	import { TextureLODManager } from '$lib/renderer/texture-lod';
	import { VisibilityManager, VISIBILITY_THRESHOLDS } from '$lib/renderer/visibility-manager';
	import { loadStarCatalog } from '$lib/data/star-catalog';
	import { loadSolarSystem, getBodiesByType } from '$lib/data/solar-system';
	import { loadNotableObjects, getObjectsByType } from '$lib/data/notable-objects';
	import { loadConstellations } from '$lib/data/constellations';
	import { loadTleSnapshot, fetchTleBatch, type TleFetchStatus } from '$lib/data/celestrak';
	import { createApiCache } from '$lib/data/api-cache';
	import { updateTles } from '$lib/renderer';
	import type { SolarSystemCatalog } from '$lib/data/solar-system';
	import type { NotableObjectCatalog } from '$lib/data/notable-objects';
	import type { StarCatalog } from '$lib/data/star-catalog';
	import type { BlackholeNO, NebulaNO, ClusterNO, SolarSystemBody, Satellite, NotableStar } from '$lib/data/types';
	import '$lib/ui/theme.css';
	import {
		HUD, NavigationHUD, StarInfoPanel, BlackholeInfoPanel, NebulaInfoPanel, ClusterInfoPanel,
		BodyInfoPanel, SatelliteInfoPanel, SearchPanel, TargetIndicator, BreadcrumbTrail,
		TransferPanel, TimeControls, GeodesicExplorer, ApproachToast, LightPathOverlay,
		LoadingScreen, WelcomeOverlay, KeyboardShortcutsOverlay,
		createHudState, SettingsPanel, BookmarksPanel, ErrorFallback
	} from '$lib/ui';
	import { createSettingsState } from '$lib/ui/settings-state.svelte';
	import type { SearchResult, SearchAction, LoadingStage } from '$lib/ui';
	import type { BreadcrumbEntry } from '$lib/ui';
	import { rankResults, setDefaultUnit } from '$lib/ui';
	import { ObjectPicker } from '$lib/engine/object-picker';
	import { SimulationClock } from '$lib/engine/simulation-clock';
	import { TransferFlight } from '$lib/engine/transfer-flight';
	import {
		ApproachDetector,
		bodyTriggerRadius,
		bodyExitRadius,
		SATELLITE_TRIGGER_RADIUS,
		SATELLITE_EXIT_RADIUS
	} from '$lib/engine/approach-detector';
	import { pushTargetToUrl, clearUrlTarget, parseUrlTarget } from '$lib/engine/url-state';
	import { addBookmark, type Bookmark } from '$lib/engine/bookmarks';
	import { captureScreenshot } from '$lib/engine/screenshot';

	let canvas: HTMLCanvasElement;
	let wasmResult = $state('loading...');
	let rendererInfo = $state('initializing...');
	let starInfo = $state('loading stars...');
	let planetInfo = $state('loading planets...');

	// Loading screen stages
	let loadingStages = $state<LoadingStage[]>([
		{ id: 'renderer', label: 'Initializing renderer', status: 'pending' },
		{ id: 'wasm', label: 'Loading physics engine', status: 'pending' },
		{ id: 'solar', label: 'Loading solar system', status: 'pending' },
		{ id: 'stars', label: 'Loading star catalog', status: 'pending' },
		{ id: 'notable', label: 'Loading deep-sky objects', status: 'pending' }
	]);
	let loadingVisible = $state(true);

	function updateStage(id: string, status: LoadingStage['status'], error?: string) {
		const stage = loadingStages.find((s) => s.id === id);
		if (stage) {
			stage.status = status;
			if (error) stage.error = error;
		}
	}

	// Welcome overlay — shown on first visit unless dismissed
	let welcomeVisible = $state(false);
	let shortcutsVisible = $state(false);
	let welcomeChecked = false; // defer localStorage read to onMount

	// Bookmarks panel
	let bookmarksVisible = $state(false);

	// Error fallback
	let renderError = $state<string | null>(null);

	// Screenshot mode — temporarily hides UI
	let screenshotMode = $state(false);

	// HUD state — reactive, drives renderer updates via $effect
	const hud = createHudState();

	// Settings state — persisted to localStorage, drives renderer config
	const settings = createSettingsState();

	// Simulation clock — manages time scaling for all ephemeris
	const simClock = new SimulationClock();

	// Approach detection — auto-selects objects when camera gets close
	const approachDetector = new ApproachDetector();

	// TLE update state
	let tleFetchStatus = $state<TleFetchStatus>({ state: 'idle' });
	let tleFetchedAt = $state<number | null>(null);

	// Transfer orbit state
	let transferRenderer = $state<TransferOrbitRenderer | null>(null);
	let transferFlight = $state<TransferFlight | null>(null);

	// Light path renderer
	let lightPathRenderer = $state<LightPathRenderer | null>(null);

	// Geodesic explorer renderer
	let geodesicExplorer = $state<GeodesicExplorerRenderer | null>(null);
	let geodesicActiveInfo = $state<ActiveGeodesicInfo | null>(null);

	// Dark adaptation — smoothed state for temporal interpolation
	const darkAdaptation = { starBrightness: 1.0, bloomMultiplier: 1.0, exposure: 1.0 };
	/** Base bloom strength from settings (before dark adaptation multiplier). */
	let baseBloomStrength = 0.8;
	let geodesicBhGeometry = $state<BlackHoleGeometryResult | null>(null);

	// Bodies list for transfer panel (populated after WASM loads)
	let transferBodies = $state<SolarSystemBody[]>([]);

	// WASM module reference for transfer computation
	let wasmRef = $state<{
		compute_hohmann: (r1: number, r2: number, mu: number) => HohmannResult;
		get_body_position: (id: number, jd: number) => Float64Array;
		get_body_constants: (id: number) => { gm: number; radius: number; radius_mean: number; sma: number; name: string };
	} | null>(null);

	// Renderer reference for warp cancel from keyboard handler
	let sidereaRef = $state<SidereaRenderer | null>(null);

	// Data catalog references for search
	let solarCatalog = $state<SolarSystemCatalog | null>(null);
	let starCatalogRef = $state<StarCatalog | null>(null);
	let notableObjectCatalog = $state<NotableObjectCatalog | null>(null);

	// Target indicator screen state (updated per frame)
	let targetScreenPos = $state<[number, number] | null>(null);
	let targetOffScreenAngle = $state<number | null>(null);
	let targetInFront = $state(true);

	// Renderer references lifted to component scope for $effect reactivity
	let planetRenderer = $state<PlanetRenderer | null>(null);
	let dwarfPlanetRenderer = $state<DwarfPlanetRenderer | null>(null);
	let cometRenderer = $state<CometRenderer | null>(null);
	let orbitPaths = $state<OrbitPathRenderer | null>(null);
	let ringRenderer = $state<RingRenderer | null>(null);
	let moonRenderer = $state<MoonRenderer | null>(null);
	let moonOrbitPaths = $state<MoonOrbitPathRenderer | null>(null);
	let beltRenderer = $state<BeltRenderer | null>(null);
	let smallBodyRenderer = $state<SmallBodyRenderer | null>(null);
	let satelliteRenderer = $state<SatelliteRenderer | null>(null);
	let positionCache: FramePositionCache | null = null;
	let probeTrajectoryRenderer = $state<ProbeTrajectoryRenderer | null>(null);
	let atmosphereRenderer = $state<AtmosphereRenderer | null>(null);
	let milkyWayRenderer = $state<MilkyWayRenderer | null>(null);
	let galacticGrid = $state<GalacticGridRenderer | null>(null);
	let galacticIndicator = $state<GalacticIndicatorRenderer | null>(null);
	let constellationRenderer = $state<ConstellationRenderer | null>(null);
	let scaleMarkers = $state<ScaleMarkerRenderer | null>(null);
	let distanceLabels = $state<DistanceLabelRenderer | null>(null);
	let starFieldRenderer = $state<StarFieldRenderer | null>(null);
	let starLabelRenderer = $state<StarLabelRenderer | null>(null);
	const visibilityManager = new VisibilityManager();
	let textureLOD: TextureLODManager | null = null;
	let textureLODTimer = 0;

	// NAIF ID ranges for orbit visibility categories
	const isPlanetOrbit = (id: number) => id >= 1 && id <= 8;
	const isDwarfPlanetOrbit = (id: number) => id >= 9 && id <= 13;
	const isCometOrbit = (id: number) => id >= 1001 && id <= 1999;
	const isSmallBodyOrbit = (id: number) => (id >= 2001 && id <= 2999) || (id >= 3001 && id <= 3999);

	// --- $effect: size exaggeration ---
	$effect(() => {
		const factor = hud.sizeExaggeration;
		planetRenderer?.setSizeExaggeration(factor);
		dwarfPlanetRenderer?.setSizeExaggeration(factor);
		smallBodyRenderer?.setSizeExaggeration(factor);
		moonRenderer?.setSizeExaggeration(factor);
		ringRenderer?.setSizeExaggeration(factor);
		atmosphereRenderer?.setSizeExaggeration(factor);
	});

	// --- $effect: orbit visibility by category ---
	$effect(() => {
		const vis = hud.orbitVisibility;
		if (!orbitPaths) return;
		orbitPaths.setVisibleWhere(isPlanetOrbit, vis.planets);
		orbitPaths.setVisibleWhere(isDwarfPlanetOrbit, vis.dwarfPlanets);
		orbitPaths.setVisibleWhere(isCometOrbit, vis.comets);
		orbitPaths.setVisibleWhere(isSmallBodyOrbit, vis.smallBodies);
	});

	$effect(() => {
		moonOrbitPaths?.setAllVisible(hud.orbitVisibility.moons);
	});

	// --- $effect: belt visibility ---
	$effect(() => {
		const vis = hud.beltVisibility;
		if (!beltRenderer) return;
		beltRenderer.setAsteroidBeltVisible(vis.asteroidBelt);
		beltRenderer.setKuiperBeltVisible(vis.kuiperBelt);
	});

	// --- $effect: galactic overlay visibility ---
	$effect(() => {
		const vis = hud.galacticVisibility;
		milkyWayRenderer?.setVisible(vis.milkyWay);
		galacticGrid?.setVisible(vis.galacticPlane);
		galacticIndicator?.setVisible(vis.galacticCenter);
		scaleMarkers?.setVisible(vis.scaleMarkers);
		constellationRenderer?.setVisible(vis.constellations);
	});

	// --- $effect: probe trajectory visibility ---
	$effect(() => {
		probeTrajectoryRenderer?.setAllVisible(hud.probeTrajectoryVisible);
	});

	// --- $effect: distance labels visibility ---
	$effect(() => {
		distanceLabels?.setVisible(hud.distanceLabelsVisible);
	});

	// --- $effect: light path visibility ---
	$effect(() => {
		lightPathRenderer?.setAllVisible(hud.lightPathVisible);
		if (!hud.lightPathVisible) {
			lightPathRenderer?.clear();
		}
	});

	// --- $effect: geodesic explorer ---
	$effect(() => {
		if (!geodesicExplorer) return;
		const active = hud.geodesicExplorerActive;
		const bh = hud.selectedBlackhole;
		geodesicExplorer.setVisible(active && !!bh);
		if (active && bh) {
			// GM = mass_solar * GM_SUN (1.327124400412794e20 m³/s²)
			const gm = bh.mass_solar * 1.327124400412794e20;
			geodesicExplorer.setBlackHole(gm);
			geodesicBhGeometry = geodesicExplorer.getGeometry();
		}
	});

	$effect(() => {
		if (!geodesicExplorer || !hud.geodesicExplorerActive) return;
		const geom = geodesicExplorer.getGeometry();
		if (!geom) return;
		const b = hud.geodesicImpactParam * geom.critical_impact_parameter;
		geodesicExplorer.setImpactParameter(b);
		geodesicActiveInfo = geodesicExplorer.getActiveInfo();
	});

	// --- $effect: settings → bloom strength ---
	$effect(() => {
		const pp = sidereaRef?.postProcessing;
		if (!pp) return;
		baseBloomStrength = settings.bloomStrength;
		pp.bloomStrength = settings.bloomStrength;
	});

	// --- $effect: settings → quality preset (bloom radius/threshold, pixel ratio) ---
	$effect(() => {
		if (!sidereaRef) return;
		const qv = settings.qualityValues;
		const pp = sidereaRef.postProcessing;
		if (pp) {
			pp.bloomRadius = qv.bloomRadius;
			pp.bloomThreshold = qv.bloomThreshold;
		}
		const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
		sidereaRef.renderer.setPixelRatio(Math.min(dpr, qv.pixelRatioMax));
	});

	// --- $effect: settings → star scintillation (respects reduced motion) ---
	$effect(() => {
		if (!starFieldRenderer) return;
		starFieldRenderer.setScintillationStrength(settings.effectiveScintillation ? 0.15 : 0);
	});

	// --- $effect: settings → label density ---
	$effect(() => {
		const ld = settings.labelDensityValues;
		if (starLabelRenderer) {
			starLabelRenderer.visible = ld.starLabelsVisible;
			starLabelRenderer.setLabelDensity({
				nearThreshold: ld.nearThreshold,
				farThreshold: ld.farThreshold,
				midMagLimit: ld.midMagLimit,
				maxLabels: ld.maxLabels,
			});
		}
	});

	// --- $effect: settings → warp duration (respects reduced motion) ---
	$effect(() => {
		sidereaRef?.cameraController.setWarpDuration(settings.effectiveWarpDuration);
	});

	// --- $effect: settings → controls sensitivity ---
	$effect(() => {
		sidereaRef?.cameraController.setOrbitSensitivity(settings.orbitSensitivity);
		sidereaRef?.cameraController.setLookSensitivity(settings.lookSensitivity);
		sidereaRef?.cameraController.setTouchSensitivity(settings.touchSensitivity);
	});

	// --- $effect: settings → unit preference ---
	$effect(() => {
		setDefaultUnit(settings.unitPreference);
	});

	// --- $effect: settings → reduced motion data attribute ---
	$effect(() => {
		document.documentElement.dataset.reducedMotion = String(settings.reducedMotion);
	});

	// --- $effect: URL state → sync selected target name to URL hash ---
	$effect(() => {
		const name = hud.targetName;
		if (name) {
			pushTargetToUrl(name);
		} else {
			clearUrlTarget();
		}
	});

	/** Fetch fresh TLE data from CelesTrak and update satellite positions. */
	async function handleTleUpdate() {
		if (tleFetchStatus.state === 'loading') return;
		tleFetchStatus = { state: 'loading' };

		try {
			// Collect NORAD IDs from catalog
			const noradIds = (solarCatalog?.satellites ?? [])
				.filter((s) => s.norad_id != null && s.orbit_type === 'tle')
				.map((s) => s.norad_id!);

			if (noradIds.length === 0) {
				tleFetchStatus = { state: 'error', message: 'No TLE-tracked satellites' };
				return;
			}

			const cache = await createApiCache();
			// Force fresh fetch by clearing cached entries first
			for (const id of noradIds) {
				await cache.delete('tle', `tle:${id}`);
			}

			const results = await fetchTleBatch(noradIds, cache);
			const tleMap = new Map<number, import('$lib/data/celestrak').TleData>();
			for (const [id, entry] of results) {
				tleMap.set(id, entry.data);
			}

			updateTles(tleMap);
			const now = Date.now();
			tleFetchedAt = now;
			tleFetchStatus = { state: 'success', updated: results.size, fetchedAt: now };
		} catch (err) {
			tleFetchStatus = { state: 'error', message: err instanceof Error ? err.message : 'Unknown error' };
		}
	}

	/** Unified search across all catalogs with fuzzy ranking. */
	function searchAll(query: string): SearchResult[] {
		const candidates: SearchResult[] = [];

		// Solar system bodies & satellites
		if (solarCatalog) {
			for (const body of solarCatalog.bodies) {
				candidates.push({ name: body.name, kind: 'body', subtitle: body.type.replace('_', ' '), data: body });
			}
			for (const sat of solarCatalog.satellites) {
				candidates.push({ name: sat.name, kind: 'satellite', subtitle: sat.subtype.replace('_', ' '), data: sat });
			}
		}

		// Notable stars
		if (starCatalogRef) {
			for (const star of starCatalogRef.notable) {
				candidates.push({ name: star.name, kind: 'star', subtitle: `Star (${star.spectral})`, data: star });
			}
		}

		// Notable objects (nebulae, clusters, black holes)
		if (notableObjectCatalog) {
			for (const obj of notableObjectCatalog.objects) {
				const kind = obj.type === 'nebula' ? 'nebula' : obj.type === 'cluster' ? 'cluster' : obj.type === 'blackhole' ? 'blackhole' : 'other';
				candidates.push({ name: obj.name, kind, subtitle: obj.type.replace('_', ' '), data: obj });
			}
		}

		return rankResults(query, candidates, 15, (result) => {
			// Provide extra searchable fields per type
			const d = result.data;
			if ('catalog_ids' in d && Array.isArray(d.catalog_ids)) return d.catalog_ids;
			if ('bayer' in d && d.bayer) return [d.bayer as string];
			if ('id' in d && typeof d.id === 'string') return [d.id];
			return [];
		});
	}

	/** Handle search result selection — select object and optionally navigate camera. */
	function onSearchSelect(result: SearchResult, action: SearchAction = 'goto') {
		hud.searchVisible = false;

		if (result.kind === 'body') {
			const body = result.data as SolarSystemBody;
			if (action === 'info') {
				// Select without warp — just show info panel
				hud.selectBody(body, hud.targetPosition ?? [0, 0, 0], hud.targetRadius ?? 0);
			} else {
				selectBodyByData(body);
			}
		} else if (result.kind === 'satellite') {
			const sat = result.data as Satellite;
			if (action === 'info') {
				hud.selectSatellite(sat, hud.targetPosition ?? [0, 0, 0]);
			} else {
				selectSatelliteByData(sat);
			}
		} else if (result.kind === 'star') {
			const star = result.data as NotableStar;
			hud.selectStar(star);
			if (action === 'goto' && starCatalogRef && sidereaRef) {
				const i = star.index * 3;
				const px = starCatalogRef.data.positions[i] * AU_PER_PARSEC;
				const py = starCatalogRef.data.positions[i + 1] * AU_PER_PARSEC;
				const pz = starCatalogRef.data.positions[i + 2] * AU_PER_PARSEC;
				hud.targetPosition = [px, py, pz];
				hud.targetRadius = 0;
				sidereaRef.cameraController.warpTo({ position: new Vector3(px, py, pz), radius: 0, name: star.name });
				hud.pushBreadcrumb({ name: star.name, kind: 'star', position: [px, py, pz], radius: 0 });
			}
		} else {
			// Notable object (nebula, cluster, blackhole)
			const obj = result.data as BlackholeNO | NebulaNO | ClusterNO;
			if (obj.type === 'blackhole') hud.selectBlackhole(obj as BlackholeNO);
			else if (obj.type === 'nebula') hud.selectNebula(obj as NebulaNO);
			else if (obj.type === 'cluster') hud.selectCluster(obj as ClusterNO);
			if (action === 'goto' && sidereaRef) {
				const px = obj.x * AU_PER_PARSEC;
				const py = obj.y * AU_PER_PARSEC;
				const pz = obj.z * AU_PER_PARSEC;
				hud.targetPosition = [px, py, pz];
				hud.targetRadius = 0;
				sidereaRef.cameraController.warpTo({ position: new Vector3(px, py, pz), radius: 0, name: obj.name });
				hud.pushBreadcrumb({ name: obj.name, kind: result.kind as BreadcrumbEntry['kind'], position: [px, py, pz], radius: 0 });
			}
		}
	}

	/** Select a solar system body by data reference (find its mesh and position). */
	function selectBodyByData(body: SolarSystemBody) {
		if (!sidereaRef) return;
		// Find mesh via renderers
		const mesh = planetRenderer?.getMesh(body.naif_id)
			?? dwarfPlanetRenderer?.getMesh(body.naif_id)
			?? cometRenderer?.getMesh(body.naif_id)
			?? smallBodyRenderer?.getMesh(body.naif_id)
			?? moonRenderer?.getMesh(body.naif_id);
		if (mesh) {
			const pos = mesh.getWorldPosition(new Vector3());
			const radiusAU = (body.radius_km / (METERS_PER_AU / 1000)) * (planetRenderer?.exaggeration ?? 200);
			hud.selectBody(body, [pos.x, pos.y, pos.z], radiusAU);
			sidereaRef.cameraController.autoFrame(pos, radiusAU);
			hud.pushBreadcrumb({ name: body.name, kind: 'body', position: [pos.x, pos.y, pos.z], radius: radiusAU });
		}
	}

	/** Select a satellite by data reference. */
	function selectSatelliteByData(sat: Satellite) {
		if (!sidereaRef || !satelliteRenderer) return;
		const sprite = satelliteRenderer.getSprite(sat.id);
		if (sprite) {
			const pos = sprite.getWorldPosition(new Vector3());
			hud.selectSatellite(sat, [pos.x, pos.y, pos.z]);
			sidereaRef.cameraController.autoFrame(pos, 0);
			hud.pushBreadcrumb({ name: sat.name, kind: 'satellite', position: [pos.x, pos.y, pos.z], radius: 0 });
		}
	}

	/** Navigate back in breadcrumb trail. */
	function breadcrumbBack() {
		// Pop current, then navigate to previous
		hud.popBreadcrumb(); // pop current
		const prev = hud.breadcrumbs[hud.breadcrumbs.length - 1];
		if (prev && sidereaRef) {
			const pos = new Vector3(prev.position[0], prev.position[1], prev.position[2]);
			sidereaRef.cameraController.autoFrame(pos, prev.radius);
		}
	}

	/** Navigate to a specific breadcrumb. */
	function breadcrumbGoto(index: number) {
		const entry = hud.breadcrumbs[index];
		if (!entry || !sidereaRef) return;
		const pos = new Vector3(entry.position[0], entry.position[1], entry.position[2]);
		sidereaRef.cameraController.autoFrame(pos, entry.radius);
	}

	/** Compute a Hohmann transfer between two bodies. */
	function computeTransfer(departureId: number, arrivalId: number) {
		if (!wasmRef || !transferRenderer) return;

		// Get orbital radii (SMA) for both bodies
		const depConst = wasmRef.get_body_constants(departureId);
		const arrConst = wasmRef.get_body_constants(arrivalId);

		// Compute Hohmann transfer using SMA as circular orbit radius
		const hohmann: HohmannResult = wasmRef.compute_hohmann(
			depConst.sma, arrConst.sma, GM_SUN
		);

		// Get current positions for visualization
		const jd = simClock.jd;
		const depPos = wasmRef.get_body_position(departureId, jd);
		const arrPos = wasmRef.get_body_position(arrivalId, jd);

		const depRadiusAU = depConst.radius / METERS_PER_AU;
		const arrRadiusAU = arrConst.radius / METERS_PER_AU;

		const plan: TransferPlan = {
			departureId,
			arrivalId,
			departureName: depConst.name,
			arrivalName: arrConst.name,
			hohmann,
			departurePos: new Vector3(
				depPos[0] / METERS_PER_AU,
				depPos[1] / METERS_PER_AU,
				depPos[2] / METERS_PER_AU
			),
			arrivalPos: new Vector3(
				arrPos[0] / METERS_PER_AU,
				arrPos[1] / METERS_PER_AU,
				arrPos[2] / METERS_PER_AU
			),
			departureRadius: depRadiusAU,
			arrivalRadius: arrRadiusAU,
			departureJD: jd,
			arrivalJD: jd + hohmann.transfer_time / 86400
		};

		transferRenderer.showTransfer(plan);
		hud.transferPlan = plan;
		hud.transferFlightState = 'planning';
	}

	/** Start the fly-along transfer. */
	function startTransferFlight() {
		if (!hud.transferPlan || !transferRenderer || !sidereaRef) return;

		const flight = new TransferFlight(hud.transferPlan, simClock.timeScale);
		transferFlight = flight;

		// Set time compression for the transfer
		simClock.timeScale = flight.requiredTimeScale;
		if (simClock.paused) simClock.paused = false;

		hud.transferFlightState = 'flying';

		// Camera targets the departure point initially
		const startPos = transferRenderer.getPositionAt(0);
		sidereaRef.cameraController.autoFrame(startPos, hud.transferPlan.departureRadius);
	}

	/** Clear/cancel transfer. */
	function clearTransfer() {
		if (transferFlight) {
			// Restore previous time scale
			simClock.timeScale = transferFlight.previousTimeScale;
			transferFlight.cancel();
			transferFlight = null;
		}
		transferRenderer?.clear();
		hud.clearTransfer();
	}

	const GM_SUN = 1.327_124_400_412_794_2e20; // m³/s²

	/**
	 * Compute and display a light path from a source object to Earth (Sol).
	 * Source position is in AU (near-scene coords) for stars/notable objects,
	 * or directly from WASM for solar system bodies.
	 */
	function computeLightPath(sourceName: string, sourceAU: [number, number, number]) {
		if (!lightPathRenderer || !wasmRef || !positionCache) return;

		// Source position in meters
		const sourceMeters: [number, number, number] = [
			sourceAU[0] * METERS_PER_AU,
			sourceAU[1] * METERS_PER_AU,
			sourceAU[2] * METERS_PER_AU
		];

		// Target: Earth position (or Sun at origin for distant objects)
		const earthPos = positionCache.getBodyPositionAU(3); // NAIF 3 = Earth
		const targetMeters: [number, number, number] = earthPos
			? [earthPos.x * METERS_PER_AU, earthPos.y * METERS_PER_AU, earthPos.z * METERS_PER_AU]
			: [0, 0, 0]; // fallback to Sun/origin

		// Gather lensing bodies: Sun + planets with significant GM
		const lensingBodies: Array<{ position: [number, number, number]; gm: number }> = [];

		// Sun at origin
		lensingBodies.push({ position: [0, 0, 0], gm: GM_SUN });

		// Add planets (those with known GM from WASM)
		const planetNaifIds = [1, 2, 3, 4, 5, 6, 7, 8]; // Mercury through Neptune
		for (const naifId of planetNaifIds) {
			const cached = positionCache.getBodyPositionAU(naifId);
			if (!cached) continue;
			try {
				const consts = wasmRef.get_body_constants(naifId);
				if (consts.gm > 0) {
					lensingBodies.push({
						position: [cached.x * METERS_PER_AU, cached.y * METERS_PER_AU, cached.z * METERS_PER_AU],
						gm: consts.gm
					});
				}
			} catch {
				// Body may not have constants in WASM — skip
			}
		}

		// Clear previous path and compute new one
		lightPathRenderer.clear();
		const result = lightPathRenderer.showPath(sourceName, sourceMeters, targetMeters, lensingBodies);
		if (result) {
			hud.activateLightPath(sourceName, sourceAU, result);
		}
	}

	/** Get source position in AU for the currently selected object. */
	function getSelectedObjectPositionAU(): [number, number, number] | null {
		if (hud.targetPosition) return hud.targetPosition;
		// For stars, compute from parsec coordinates
		if (hud.selectedStar) {
			const s = hud.selectedStar;
			// Stars have RA (hours), Dec (degrees), dist (parsecs)
			// Positions are in the catalog as index-based Float32Array in parsecs
			// But targetPosition should be set when selecting a star
			return null;
		}
		return null;
	}

	/** Handle "View light path" button press from any info panel. */
	function onViewLightPath() {
		const pos = getSelectedObjectPositionAU();
		const name = hud.targetName;
		if (!pos || !name) return;
		computeLightPath(name, pos);
	}

	/** Get the kind of the currently selected object. */
	function getSelectedKind(): Bookmark['targetKind'] {
		if (hud.selectedBody) return 'body';
		if (hud.selectedSatellite) return 'satellite';
		if (hud.selectedStar) return 'star';
		if (hud.selectedBlackhole) return 'blackhole';
		if (hud.selectedNebula) return 'nebula';
		if (hud.selectedCluster) return 'cluster';
		return null;
	}

	/** Capture screenshot: briefly hide HUD, capture canvas, restore HUD. */
	async function handleScreenshot() {
		if (!canvas || screenshotMode) return;
		const wasHudVisible = hud.hudVisible;
		screenshotMode = true;
		hud.hudVisible = false;
		// Wait two frames for UI to hide and canvas to re-render
		await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
		try {
			await captureScreenshot(canvas, hud.targetName);
		} catch (err) {
			console.error('[Siderea] Screenshot failed:', err);
		}
		hud.hudVisible = wasHudVisible;
		screenshotMode = false;
	}

	/** Navigate to an object by name (for URL deep-links and bookmarks). */
	function navigateToByName(name: string) {
		// Search for the object
		const results = searchAll(name);
		if (results.length > 0) {
			onSearchSelect(results[0], 'goto');
		}
	}

	/** Load a bookmark: restore camera state and navigate to saved target. */
	function handleBookmarkLoad(bm: Bookmark) {
		bookmarksVisible = false;
		if (!sidereaRef) return;
		sidereaRef.cameraController.deserialize(bm.camera);
		// Re-select the target if it had one
		if (bm.targetName) {
			navigateToByName(bm.targetName);
		}
	}

	// Keyboard: H to toggle HUD, / to search
	function onKeyDown(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		if (e.code === 'KeyH') {
			hud.hudVisible = !hud.hudVisible;
		}
		if (e.key === '?') {
			shortcutsVisible = !shortcutsVisible;
			return;
		}
		if (e.code === 'Slash' || e.code === 'KeyF' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			hud.toggleSearch();
		}
		if (e.code === 'KeyT') {
			hud.toggleTransferPanel();
		}
		if (e.code === 'KeyL') {
			if (hud.lightPathVisible) {
				// Closing — clear path
				lightPathRenderer?.clear();
				hud.clearLightPath();
			} else {
				hud.toggleLightPath();
			}
		}
		if (e.code === 'KeyG') {
			hud.toggleGeodesicExplorer();
		}
		if (e.code === 'KeyC') {
			hud.toggleCoordinateDisplay();
		}
		if (e.code === 'Comma') {
			settings.togglePanel();
		}
		if (e.code === 'KeyB' && !e.ctrlKey && !e.metaKey) {
			if (bookmarksVisible) {
				bookmarksVisible = false;
			} else if (e.shiftKey) {
				// Shift+B: open bookmarks panel
				bookmarksVisible = true;
			} else {
				// B: quick-save bookmark at current position
				if (sidereaRef) {
					const cam = sidereaRef.cameraController.serialize();
					addBookmark(cam, hud.targetName, getSelectedKind());
				}
			}
		}
		if (e.code === 'F9') {
			e.preventDefault();
			handleScreenshot();
		}
		if (e.code === 'Escape') {
			if (bookmarksVisible) {
				bookmarksVisible = false;
				return;
			}
			if (shortcutsVisible) {
				shortcutsVisible = false;
				return;
			}
			if (settings.panelVisible) {
				settings.panelVisible = false;
				return;
			}
			if (hud.searchVisible) {
				hud.searchVisible = false;
				return;
			}
			if (hud.isWarping) {
				// Cancel warp first; don't also close panels
				sidereaRef?.cameraController.cancelWarp();
				hud.warpPhase = WarpPhase.IDLE;
				hud.warpProgress = 0;
				hud.warpTargetName = null;
				return;
			}
			hud.deselectAll();
		}
	}

	onMount(() => {
		// Check welcome overlay on mount (needs browser for localStorage)
		if (!welcomeChecked) {
			welcomeChecked = true;
			try {
				welcomeVisible = !localStorage.getItem('siderea-welcome-dismissed');
			} catch {
				welcomeVisible = true;
			}
		}

		// Track non-reactive disposables
		// starField and starLabels are aliased from component-scope $state vars
		// so $effect blocks can react to them. Local vars are used in the frame loop.
		let starField: StarFieldRenderer | null = null;
		let starLabels: StarLabelRenderer | null = null;
		let warpEffects: WarpEffects | null = null;

		// Renderer setup
		updateStage('renderer', 'loading');
		const siderea = new SidereaRenderer({
			canvas,
			antialias: true,
			postProcessing: {
				bloomStrength: 0.8,
				bloomRadius: 0.4,
				bloomThreshold: 0.8
			},
			cameraController: {
				initialMode: CameraMode.ORBIT,
				target: new Vector3(0, 0, 0)
			},
			performanceMonitor: {
				phaseBudgets: { wasm: 2, sceneGraph: 2, render: 10, ui: 2 }
			},
			onFrame: (delta, elapsed) => {
				siderea.perfMonitor?.markPhase('ui');
				// Update camera distance and mode readout
				const camPos = siderea.camera.position;
				const target = siderea.cameraController.getTarget();
				hud.cameraDistance = camPos.distanceTo(target);
				hud.cameraMode = siderea.cameraController.mode;

				// Update velocity display
				hud.cameraSpeed = siderea.cameraController.getSpeed();

				// Compute compass orientation from camera forward direction
				const camForward = new Vector3(0, 0, -1).applyQuaternion(siderea.camera.quaternion);
				const camRight = new Vector3(1, 0, 0).applyQuaternion(siderea.camera.quaternion);
				const camUp = new Vector3(0, 1, 0).applyQuaternion(siderea.camera.quaternion);

				// Galactic north altitude: angle between camera forward and galactic north
				const gnDot = camForward.dot(GALACTIC_NORTH_POLE);
				const galacticNorthAlt = Math.asin(Math.max(-1, Math.min(1, gnDot)));

				// Ecliptic north altitude
				const enDot = camForward.dot(ECLIPTIC_NORTH_POLE);
				const eclipticNorthAlt = Math.asin(Math.max(-1, Math.min(1, enDot)));

				// Galactic center azimuth: project GC direction into camera's horizontal plane
				const gcProj = GALACTIC_CENTER_DIR.clone()
					.addScaledVector(camUp, -GALACTIC_CENTER_DIR.dot(camUp));
				const gcLen = gcProj.length();
				let galacticCenterAz = 0;
				if (gcLen > 1e-6) {
					gcProj.normalize();
					galacticCenterAz = Math.atan2(gcProj.dot(camRight), gcProj.dot(camForward));
				}
				hud.compassHeading = { galacticNorthAlt, galacticCenterAz, eclipticNorthAlt };

				// Compute coordinate display (only when visible to avoid unnecessary work)
				if (hud.coordinateDisplayVisible) {
					// J2000 equatorial: RA/Dec from camera forward direction
					// Convention: x = cos(dec)*cos(ra), y = cos(dec)*sin(ra), z = sin(dec)
					const ra = Math.atan2(camForward.y, camForward.x);
					const dec = Math.asin(Math.max(-1, Math.min(1, camForward.z)));
					const galLat = galacticLatitude(camForward);
					const galLon = galacticLongitude(camForward);
					const eclLat = eclipticLatitude(camForward);
					const eclLon = eclipticLongitude(camForward);
					hud.coordinates = {
						ra: ra < 0 ? ra + 2 * Math.PI : ra,
						dec,
						galLon: galLon < 0 ? galLon + 2 * Math.PI : galLon,
						galLat,
						eclLon,
						eclLat
					};
				}

				// Find nearest solar system body
				if (planetRenderer) {
					let nearestName: string | null = null;
					let nearestDist = Infinity;
					const checkBody = (naifId: number, name: string) => {
						const mesh = planetRenderer!.getMesh(naifId)
							?? dwarfPlanetRenderer?.getMesh(naifId)
							?? moonRenderer?.getMesh(naifId);
						if (!mesh) return;
						const d = camPos.distanceTo(mesh.getWorldPosition(new Vector3()));
						if (d < nearestDist) {
							nearestDist = d;
							nearestName = name;
						}
					};
					if (solarCatalog) {
						for (const body of solarCatalog.bodies) {
							checkBody(body.naif_id, body.name);
						}
					}
					// Include the Sun at origin
					const sunDist = camPos.length();
					if (sunDist < nearestDist) {
						nearestDist = sunDist;
						nearestName = 'Sun';
					}
					hud.nearestBodyName = nearestName;
					hud.nearestBodyDistance = nearestDist < Infinity ? nearestDist : null;
				}

				// Approach detection — auto-select objects when camera gets close
				if (!hud.isWarping && !hud.isTransferFlying) {
					const approach = approachDetector.update(camPos);
					if (approach && !hud.hasTarget) {
						if (approach.kind === 'body') {
							// Find the SolarSystemBody data for this NAIF ID
							const naifId = parseInt(approach.key.split(':')[1], 10);
							const body = solarCatalog?.bodies.find(b => b.naif_id === naifId);
							if (body) {
								const pos = approach.position;
								const radiusAU = (body.radius_km / (METERS_PER_AU / 1000)) * (planetRenderer?.exaggeration ?? 1);
								hud.selectBody(body, [pos.x, pos.y, pos.z], radiusAU);
								hud.pushBreadcrumb({
									name: body.name, kind: 'body',
									position: [pos.x, pos.y, pos.z], radius: radiusAU
								});
								// Highlight the mesh
								const mesh = planetRenderer?.getMesh(naifId)
									?? dwarfPlanetRenderer?.getMesh(naifId)
									?? cometRenderer?.getMesh(naifId)
									?? smallBodyRenderer?.getMesh(naifId)
									?? moonRenderer?.getMesh(naifId);
								selectionHighlight.setTarget(mesh ?? null, radiusAU);
							}
						} else if (approach.kind === 'satellite') {
							const satId = approach.key.split(':')[1];
							const sat = solarCatalog?.satellites.find(s => s.id === satId);
							if (sat) {
								const pos = approach.position;
								hud.selectSatellite(sat, [pos.x, pos.y, pos.z]);
								hud.pushBreadcrumb({
									name: sat.name, kind: 'satellite',
									position: [pos.x, pos.y, pos.z], radius: 0
								});
								selectionHighlight.hide();
							}
						}
						hud.showApproach(approach.name);
					}
				}

				// Update warp effects and HUD warp state
				const warpState = siderea.cameraController.getWarpState();
				if (warpState) {
					hud.warpPhase = warpState.phase;
					hud.warpProgress = warpState.progress;
					hud.warpTargetName = warpState.targetName;
				} else if (hud.isWarping) {
					hud.warpPhase = WarpPhase.IDLE;
					hud.warpProgress = 0;
					hud.warpTargetName = null;
				}

				// Drive visual effects from warp state (skip when reduced motion)
				if (warpEffects) {
					if (settings.reducedMotion) {
						warpEffects.update(null, camPos, new Vector3(0, 0, -1));
					} else {
						const forward = new Vector3(0, 0, -1).applyQuaternion(siderea.camera.quaternion);
						warpEffects.update(warpState, camPos, forward);
					}
				}

				// Update star LOD — pass far camera position (parsecs) to shader
				if (starField) {
					const farCam = layers.far.camera.position;
					starField.updateCameraPosition(farCam.x, farCam.y, farCam.z);

					// Dynamic magnitude cutoff based on camera distance from origin.
					// When orbiting a specific target, show the full star field regardless
					// of distance from origin — the per-star LOD shader handles distance-
					// based dimming. Only apply aggressive culling in free-fly mode where
					// the user is viewing the galaxy at large scale.
					const camDistPc = farCam.length();
					const mode = siderea.cameraController.mode;
					const magCutoff = mode === CameraMode.ORBIT
						? Math.max(12.0, cameraDistanceToMagCutoff(camDistPc))
						: cameraDistanceToMagCutoff(camDistPc);
					starField.updateMagnitudeCutoff(magCutoff);

					// Scintillation time (elapsed seconds from renderer clock)
					starField.updateTime(elapsed);
				}

				// Dark adaptation — dim stars near bright objects, enhance in deep space
				{
					const sunDistAU = camPos.length();
					const target = computeDarkAdaptation(sunDistAU);
					smoothAdaptation(darkAdaptation, target, delta);

					if (starField) {
						starField.setGlobalBrightness(darkAdaptation.starBrightness);
					}
					siderea.renderer.toneMappingExposure = darkAdaptation.exposure;
					if (siderea.postProcessing && !hud.isWarping) {
						// Only apply bloom adaptation when not warping (warp has its own bloom control)
						siderea.postProcessing.bloomStrength = baseBloomStrength * darkAdaptation.bloomMultiplier;
					}
				}

				// Update Milky Way crossfade based on camera distance from origin
				if (milkyWayRenderer) {
					const farCamDist = layers.far.camera.position.length();
					milkyWayRenderer.update(farCamDist);
				}

				// Update distance-based visibility for near-scene detail renderers
				visibilityManager.update(layers.far.camera.position.length());

				// Update texture LOD (throttled — check every 0.5s)
				textureLODTimer += delta;
				if (textureLODTimer > 0.5) {
					textureLODTimer = 0;
					textureLOD?.update();
				}

				// Update star, black hole, nebula, and cluster labels (project to screen)
				const { width, height } = canvas.getBoundingClientRect();
				if (starLabels || blackholeLabels || nebulaLabels || clusterLabels) {
					starLabels?.update(layers.far.camera, width, height);
					blackholeLabels?.update(layers.far.camera, width, height);
					nebulaLabels?.update(layers.far.camera, width, height);
					clusterLabels?.update(layers.far.camera, width, height);
				}

				// Update galactic indicator, scale markers, and constellation labels
				galacticIndicator?.update(layers.far.camera, width, height);
				scaleMarkers?.update(layers.far.camera, width, height);
				constellationRenderer?.update(layers.far.camera, width, height);

				// Update distance labels between solar system objects (near camera)
				distanceLabels?.update(layers.near.camera, width, height);

				// Update selection highlight
				selectionHighlight.update(delta);

				// Update target indicator (project target to screen)
				if (hud.targetPosition) {
					const tp = hud.targetPosition;
					const targetVec = new Vector3(tp[0], tp[1], tp[2]);
					const camPos = siderea.camera.position;
					hud.targetDistance = camPos.distanceTo(targetVec);

					// Project to screen
					const proj = targetVec.clone().project(layers.near.camera);
					const onScreen = proj.z > 0 && proj.z < 1 &&
						proj.x >= -1 && proj.x <= 1 &&
						proj.y >= -1 && proj.y <= 1;

					targetInFront = proj.z > 0 && proj.z < 1;

					if (onScreen) {
						targetScreenPos = [
							(proj.x + 1) * width / 2,
							(-proj.y + 1) * height / 2
						];
						targetOffScreenAngle = null;
					} else {
						targetScreenPos = null;
						// Compute direction from screen center to projected point
						const sx = proj.x * width / 2;
						const sy = -proj.y * height / 2;
						// If behind camera, flip direction
						const flipSign = targetInFront ? 1 : -1;
						targetOffScreenAngle = Math.atan2(sy * flipSign, sx * flipSign);
					}
				} else {
					hud.targetDistance = null;
					targetScreenPos = null;
					targetOffScreenAngle = null;
				}

				// Advance simulation clock and sync HUD state
				simClock.tick(delta);
				hud.simTimeScale = simClock.timeScale;
				hud.simDateString = simClock.dateTimeString;
				hud.simPaused = simClock.paused;

				// Update light path pulse animation
				lightPathRenderer?.update(delta);

				// Update transfer flight progress
				if (transferFlight && transferFlight.active) {
					const simDelta = delta * simClock.timeScale;
					const progress = transferFlight.tick(simDelta);
					hud.transferProgress = progress;

					// Move spacecraft marker along transfer path
					if (transferRenderer) {
						transferRenderer.updateCraft(progress);

						// Camera follows the spacecraft
						const pos = transferRenderer.getPositionAt(progress);
						siderea.cameraController.setTarget(pos);
					}

					if (transferFlight.arrived) {
						// Decelerate time back to 1x
						simClock.timeScale = 1;
						hud.transferFlightState = 'arrived';
						transferRenderer?.hideCraft();

						// Auto-frame the arrival body
						if (transferFlight.plan.arrivalPos) {
							siderea.cameraController.autoFrame(
								transferFlight.plan.arrivalPos,
								transferFlight.plan.arrivalRadius
							);
						}
						transferFlight = null;
					}
				}

				// Update planet positions and rotations each frame
				if (planetRenderer) {
					const jd = simClock.jd;

					// Batch all WASM position queries into 2 calls (bodies + moons)
					siderea.perfMonitor?.markPhase('wasm');
					positionCache?.compute(jd);

					siderea.perfMonitor?.markPhase('sceneGraph');
					planetRenderer.update(delta, jd, positionCache ?? undefined);

					if (dwarfPlanetRenderer) {
						dwarfPlanetRenderer.update(delta, jd, positionCache ?? undefined);
					}

					if (cometRenderer) {
						cometRenderer.update(delta, jd, positionCache ?? undefined);
					}

					if (smallBodyRenderer) {
						smallBodyRenderer.update(delta, jd, positionCache ?? undefined);
					}

					if (satelliteRenderer) {
						satelliteRenderer.update(jd, positionCache ?? undefined);
					}

					// Mesh lookup that checks planets, dwarf planets, comets, and small bodies
					const getMesh = (naifId: number) =>
						planetRenderer!.getMesh(naifId)
						?? dwarfPlanetRenderer?.getMesh(naifId)
						?? cometRenderer?.getMesh(naifId)
						?? smallBodyRenderer?.getMesh(naifId);

					if (moonRenderer) {
						moonRenderer.update(jd, getMesh, positionCache ?? undefined);
					}

					if (moonOrbitPaths) {
						moonOrbitPaths.update(getMesh);
					}

					// Update orbit line fade based on body positions
					if (orbitPaths) {
						orbitPaths.updateAllBodyProgress(getMesh);
					}

					// Update ring shadow sun directions
					if (ringRenderer) {
						ringRenderer.update(getMesh);
					}
				}
			}
		});

		sidereaRef = siderea;
		const { layers } = siderea;

		// Warp visual effects (speed lines go in the near scene so they render on top)
		warpEffects = new WarpEffects(layers.near.scene);
		warpEffects.bind({
			cameraController: siderea.cameraController
		});

		// --- Raycaster for double-click → auto-frame picking ---
		const raycaster = new Raycaster();
		const ndcMouse = new Vector2();

		siderea.cameraController.onAutoFrame = (clientX: number, clientY: number) => {
			const rect = canvas.getBoundingClientRect();
			ndcMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
			ndcMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

			raycaster.setFromCamera(ndcMouse, layers.near.camera);
			const hits = raycaster.intersectObjects(layers.near.scene.children, true);

			if (hits.length > 0) {
				const hit = hits[0];
				const pos = hit.object.getWorldPosition(new Vector3());

				// Estimate object radius from bounding sphere (hit object is a Mesh)
				const mesh = hit.object as Mesh;
				mesh.geometry?.computeBoundingSphere?.();
				const bs = mesh.geometry?.boundingSphere;
				const radius = bs ? bs.radius * mesh.scale.x : 0;

				siderea.cameraController.autoFrame(pos, radius);
			}
		};

		// --- Object picker for single-click selection ---
		const objectPicker = new ObjectPicker({
			nearCamera: layers.near.camera,
			farCamera: layers.far.camera,
			nearScene: layers.near.scene,
			canvas
		});

		// --- Selection highlight wireframe overlay ---
		const selectionHighlight = new SelectionHighlight(layers.near.scene);

		siderea.cameraController.onClick = (clientX: number, clientY: number) => {
			const result = objectPicker.pick(clientX, clientY);
			if (!result) {
				hud.deselectAll();
				selectionHighlight.hide();
				return;
			}
			if (result.kind === 'body') {
				const pos = result.position;
				hud.selectBody(result.body, [pos.x, pos.y, pos.z], result.radiusAU);
				hud.pushBreadcrumb({
					name: result.body.name, kind: 'body',
					position: [pos.x, pos.y, pos.z], radius: result.radiusAU
				});
				// Find mesh for highlight
				const mesh = planetRenderer?.getMesh(result.body.naif_id)
					?? dwarfPlanetRenderer?.getMesh(result.body.naif_id)
					?? cometRenderer?.getMesh(result.body.naif_id)
					?? smallBodyRenderer?.getMesh(result.body.naif_id)
					?? moonRenderer?.getMesh(result.body.naif_id);
				selectionHighlight.setTarget(mesh ?? null, result.radiusAU);
			} else if (result.kind === 'star') {
				hud.selectStar(result.star);
				// Star positions are in parsecs, convert to AU for target tracking
				const auPos = result.position.clone().multiplyScalar(AU_PER_PARSEC);
				hud.targetPosition = [auPos.x, auPos.y, auPos.z];
				hud.targetRadius = 0;
				hud.pushBreadcrumb({
					name: result.star.name, kind: 'star',
					position: [auPos.x, auPos.y, auPos.z], radius: 0
				});
				selectionHighlight.hide(); // stars don't have a near-scene mesh
			}
		};

		// --- NEAR SCENE (solar system scale, 1 unit = 1 AU) ---

		// Visibility groups — toggled by VisibilityManager based on camera distance
		const nearDetailGroup = new Group();
		nearDetailGroup.name = 'near-detail';
		layers.near.scene.add(nearDetailGroup);

		const dwarfPlanetGroup = new Group();
		dwarfPlanetGroup.name = 'dwarf-planets';
		layers.near.scene.add(dwarfPlanetGroup);

		const navigationGroup = new Group();
		navigationGroup.name = 'navigation-aids';
		layers.near.scene.add(navigationGroup);

		const sun = new SunRenderer();
		sun.addTo(layers.near.scene);

		const lighting = new SolarSystemLighting();
		lighting.addTo(layers.near.scene);

		// Load WASM + solar system registry, then set up planets and orbits
		updateStage('wasm', 'loading');
		updateStage('solar', 'loading');
		Promise.all([
			import('$lib/wasm/wasm_bridge').then(async (m) => { await m.default(); updateStage('wasm', 'done'); return m; }),
			loadSolarSystem().then((c) => { updateStage('solar', 'done'); return c; })
		])
			.then(([wasm, catalog]) => {
				const pos = wasm.get_body_position(3, 2451545.0);
				wasmResult = `Earth @ J2000: [${(pos[0] / 1e9).toFixed(1)}, ${(pos[1] / 1e9).toFixed(1)}, ${(pos[2] / 1e9).toFixed(1)}] Gm`;

				// --- Planets ---
				const planets = getBodiesByType(catalog, 'planet');
				planetRenderer = new PlanetRenderer(planets, { wasm });
				planetRenderer.addTo(layers.near.scene);

				// --- Dwarf planets ---
				const dwarfPlanets = getBodiesByType(catalog, 'dwarf_planet');
				dwarfPlanetRenderer = new DwarfPlanetRenderer(dwarfPlanets, { wasm });
				dwarfPlanetRenderer.addTo(dwarfPlanetGroup);

				// --- Comets ---
				const comets = getBodiesByType(catalog, 'comet');
				cometRenderer = new CometRenderer(comets, { wasm });
				cometRenderer.addTo(nearDetailGroup);

				// --- Planetary rings (Saturn, Uranus, Neptune, Haumea) ---
				const ringedBodies = [...planets, ...dwarfPlanets];
				ringRenderer = new RingRenderer(ringedBodies, {
					sizeExaggeration: planetRenderer.exaggeration
				});
				const getRingedMesh = (naifId: number) =>
					planetRenderer!.getMesh(naifId) ?? dwarfPlanetRenderer!.getMesh(naifId);
				ringRenderer.attachTo(getRingedMesh);

				// --- Atmospheric rim-lighting ---
				const allBodiesWithAtmo = [...planets, ...getBodiesByType(catalog, 'dwarf_planet')];
				atmosphereRenderer = new AtmosphereRenderer(allBodiesWithAtmo, {
					sizeExaggeration: planetRenderer.exaggeration
				});
				atmosphereRenderer.attachTo(getRingedMesh);

				// --- Orbital paths ---
				const jd = simClock.jd;
				const orbitalPeriods = new Map<number, number>();
				for (const body of planets) {
					orbitalPeriods.set(body.naif_id, body.orbital_period_days);
				}

				orbitPaths = new OrbitPathRenderer({ wasm, lineWidth: 2.0, opacity: 0.5 });
				orbitPaths.computeOrbits(jd, orbitalPeriods);
				orbitPaths.computeDwarfOrbits(dwarfPlanetRenderer.naifIds);
				orbitPaths.addTo(nearDetailGroup);

				// --- Moons ---
				const moons = getBodiesByType(catalog, 'moon');
				moonRenderer = new MoonRenderer(moons, {
					wasm,
					sizeExaggeration: planetRenderer.exaggeration,
					distanceExaggeration: 0.5
				});
				moonRenderer.addTo(nearDetailGroup);

				// --- Asteroid belt & Kuiper belt particle clouds ---
				beltRenderer = new BeltRenderer();
				beltRenderer.addTo(nearDetailGroup);

				// --- Notable asteroids & KBOs ---
				const asteroids = getBodiesByType(catalog, 'asteroid');
				const kbos = getBodiesByType(catalog, 'kbo');
				const smallBodies = [...asteroids, ...kbos];
				smallBodyRenderer = new SmallBodyRenderer(smallBodies, {
					wasm,
					sizeExaggeration: planetRenderer.exaggeration
				});
				smallBodyRenderer.addTo(nearDetailGroup);

				// --- Small body orbital paths ---
				orbitPaths.computeSmallBodyOrbits(smallBodyRenderer.naifIds);

				// --- Man-made satellites & spacecraft (load TLE snapshot first) ---
				loadTleSnapshot().then((tleSnapshot) => {
					loadSnapshotTles(tleSnapshot);
				});
				satelliteRenderer = new SatelliteRenderer(catalog.satellites, { wasm });
				satelliteRenderer.addTo(nearDetailGroup);

				// --- Probe trajectory lines ---
				probeTrajectoryRenderer = new ProbeTrajectoryRenderer(catalog.satellites);
				probeTrajectoryRenderer.computeTrajectories(jd);
				probeTrajectoryRenderer.addTo(nearDetailGroup);

				// --- Moon orbital paths ---
				moonOrbitPaths = new MoonOrbitPathRenderer({
					wasm,
					sizeExaggeration: planetRenderer.exaggeration,
					distanceExaggeration: 0.5,
					lineWidth: 0.8,
					opacity: 0.25
				});
				moonOrbitPaths.computeOrbits(moonRenderer.moonIds);
				moonOrbitPaths.addTo(nearDetailGroup);

				// --- Batched WASM position cache ---
				positionCache = new FramePositionCache(wasm as import('$lib/renderer').WasmBatchEphemeris);
				positionCache.setBodyIds([
					...planetRenderer.naifIds,
					...dwarfPlanetRenderer.naifIds,
					...cometRenderer.naifIds,
					...smallBodyRenderer.naifIds
				]);
				positionCache.setMoonIds(moonRenderer.moonIds);

				// --- Texture LOD: progressive texture loading for planets/moons/rings ---
				textureLOD = new TextureLODManager({
					applyPlanetTexture: (naifId, tex) => planetRenderer?.applyTexture(naifId, tex),
					applyDwarfTexture: (naifId, tex) => dwarfPlanetRenderer?.applyTexture(naifId, tex),
					applyMoonTexture: (naifId, tex) => moonRenderer?.applyTexture(naifId, tex),
					applyRingTexture: (naifId, tex) => ringRenderer?.applyTexture(naifId, tex),
					getDistanceAU: (naifId) => {
						const mesh = planetRenderer?.getMesh(naifId)
							?? dwarfPlanetRenderer?.getMesh(naifId)
							?? moonRenderer?.getMesh(naifId);
						if (!mesh) return null;
						return siderea.camera.position.distanceTo(mesh.position);
					}
				});
				textureLOD.init();

				// Warp collision avoidance: provide current body positions as obstacles
				const allBodiesForAvoidance = [...planets, ...dwarfPlanets];
				siderea.cameraController.obstacleProvider = () => {
					const obstacles: WarpObstacle[] = [];
					for (const body of allBodiesForAvoidance) {
						const pos = positionCache!.getBodyPositionAU(body.naif_id);
						if (!pos) continue;
						// Avoidance radius: exaggerated visual radius × 3 for comfortable clearance
						const radiusAU = (body.radius_km / (METERS_PER_AU / 1000)) * planetRenderer!.exaggeration * 3;
						obstacles.push({
							position: new Vector3(pos.x, pos.y, pos.z),
							radius: Math.max(radiusAU, 0.001) // min ~150,000 km
						});
					}
					return obstacles;
				};

				// Register all near-scene bodies with the object picker
				const allRenderable = [...planets, ...dwarfPlanets, ...comets, ...smallBodies, ...moons];
				for (const body of allRenderable) {
					const mesh = planetRenderer!.getMesh(body.naif_id)
						?? dwarfPlanetRenderer!.getMesh(body.naif_id)
						?? cometRenderer!.getMesh(body.naif_id)
						?? smallBodyRenderer!.getMesh(body.naif_id)
						?? moonRenderer!.getMesh(body.naif_id);
					if (mesh) {
						const radiusAU = (body.radius_km / (METERS_PER_AU / 1000)) * planetRenderer!.exaggeration;
						objectPicker.registerBody(mesh, body, radiusAU);
					}
				}

				// Register bodies and satellites with approach detector
				const exag = planetRenderer!.exaggeration;
				for (const body of allRenderable) {
					const naifId = body.naif_id;
					const trigR = bodyTriggerRadius(body.radius_km, exag);
					approachDetector.register({
						key: `body:${naifId}`,
						name: body.name,
						kind: 'body',
						getPosition: () => {
							const mesh = planetRenderer?.getMesh(naifId)
								?? dwarfPlanetRenderer?.getMesh(naifId)
								?? cometRenderer?.getMesh(naifId)
								?? smallBodyRenderer?.getMesh(naifId)
								?? moonRenderer?.getMesh(naifId);
							return mesh ? mesh.getWorldPosition(new Vector3()) : null;
						},
						triggerRadius: trigR,
						exitRadius: bodyExitRadius(trigR)
					});
				}
				// Register satellites
				for (const sat of catalog.satellites) {
					approachDetector.register({
						key: `sat:${sat.id}`,
						name: sat.name,
						kind: 'satellite',
						getPosition: () => {
							const sprite = satelliteRenderer?.getSprite(sat.id);
							return sprite ? sprite.getWorldPosition(new Vector3()) : null;
						},
						triggerRadius: SATELLITE_TRIGGER_RADIUS,
						exitRadius: SATELLITE_EXIT_RADIUS
					});
				}

				// Store solar system catalog reference for search
				solarCatalog = catalog;

				// Store WASM ref and transfer-eligible bodies for transfer panel
				wasmRef = wasm as unknown as typeof wasmRef;
				transferBodies = [...planets, ...dwarfPlanets];

				// --- Transfer orbit renderer ---
				transferRenderer = new TransferOrbitRenderer();
				transferRenderer.addTo(navigationGroup);

				// --- Light path renderer ---
				lightPathRenderer = new LightPathRenderer({
					wasm: wasm as unknown as WasmLightPath,
					lineWidth: 1.5,
					opacity: 0.6
				});
				lightPathRenderer.onDrawComplete(() => {
					hud.lightPathDrawing = false;
				});
				lightPathRenderer.addTo(navigationGroup);

				// --- Geodesic explorer renderer ---
				geodesicExplorer = new GeodesicExplorerRenderer();
				geodesicExplorer.setWasm(wasm as unknown as WasmLightPath);
				geodesicExplorer.setVisible(false);
				geodesicExplorer.addTo(navigationGroup);

				// --- Distance labels (optional overlay between solar system objects) ---
				distanceLabels = new DistanceLabelRenderer(canvas);

				// Sun → planet pairs
				const sunPos = originPositionGetter();
				for (const body of planets) {
					const id = body.naif_id;
					distanceLabels.addPair({
						nameA: 'Sun',
						nameB: body.name,
						getPositionA: sunPos,
						getPositionB: meshPositionGetter(() => planetRenderer!.getMesh(id)),
						maxCameraDistance: body.orbital_period_days < 800 ? 15 : 80
					});
				}

				// Planet → moon pairs (show when close to the planet)
				for (const moon of moons) {
					const parentBody = planets.find(p => p.id === moon.parent_id)
						?? dwarfPlanets.find(p => p.id === moon.parent_id);
					if (!parentBody) continue;
					const parentId = parentBody.naif_id;
					const moonId = moon.naif_id;
					distanceLabels.addPair({
						nameA: parentBody.name,
						nameB: moon.name,
						getPositionA: meshPositionGetter(() =>
							planetRenderer!.getMesh(parentId) ?? dwarfPlanetRenderer!.getMesh(parentId)),
						getPositionB: meshPositionGetter(() => moonRenderer!.getMesh(moonId)),
						maxCameraDistance: 0.5
					});
				}

				// Apply initial visibility state
				distanceLabels.setVisible(hud.distanceLabelsVisible);

				const moonCount = moonRenderer.moonIds.length;
				const satCount = satelliteRenderer?.spriteCount ?? 0;
				planetInfo = `${planets.length} planets + ${dwarfPlanets.length} dwarf planets + ${comets.length} comets + ${moonCount} moons + ${smallBodies.length} small bodies + ${satCount} satellites + belts + orbits + rings`;

				// --- Register visibility zones for distance-based hiding ---
				const nd = VISIBILITY_THRESHOLDS.NEAR_DETAIL;
				visibilityManager.addZone({
					label: 'Near detail',
					getObjects: () => [nearDetailGroup],
					showThresholdPc: nd.show,
					hideThresholdPc: nd.hide
				});

				const dp = VISIBILITY_THRESHOLDS.DWARF_PLANETS;
				visibilityManager.addZone({
					label: 'Dwarf planets',
					getObjects: () => [dwarfPlanetGroup],
					showThresholdPc: dp.show,
					hideThresholdPc: dp.hide
				});

				const nav = VISIBILITY_THRESHOLDS.NAVIGATION;
				visibilityManager.addZone({
					label: 'Navigation aids',
					getObjects: () => [navigationGroup],
					showThresholdPc: nav.show,
					hideThresholdPc: nav.hide
				});
			})
			.catch((err) => {
				planetInfo = `Planet load failed: ${err}`;
				updateStage('wasm', 'error', String(err));
				updateStage('solar', 'error', String(err));
				console.error('[Siderea] Planet/WASM setup failed:', err);
			});

		// --- FAR SCENE (stellar scale, 1 unit = 1 parsec) ---
		let blackholeLabels: BlackholeLabelRenderer | null = null;
		let nebulaLabels: NebulaLabelRenderer | null = null;
		let nebulaRenderer: NebulaRenderer | null = null;
		let clusterLabels: ClusterLabelRenderer | null = null;
		let clusterRenderer: ClusterRenderer | null = null;

		updateStage('stars', 'loading');
		updateStage('notable', 'loading');
		Promise.all([
			loadStarCatalog().then((c) => { updateStage('stars', 'done'); return c; }),
			loadNotableObjects().then((n) => { updateStage('notable', 'done'); return n; }),
			loadConstellations()
		])
			.then(([catalog, notableObjects, constellationData]) => {
				starField = new StarFieldRenderer(catalog.data, {}, catalog.notable);
				starField.addTo(layers.far.scene);
				starFieldRenderer = starField;

				starLabels = new StarLabelRenderer(catalog, canvas, {
					onSelect: (star) => {
						hud.selectStar(star);
						const i = star.index * 3;
						const pos = catalog.data.positions;
						hud.targetPosition = [
							pos[i] * AU_PER_PARSEC,
							pos[i + 1] * AU_PER_PARSEC,
							pos[i + 2] * AU_PER_PARSEC
						];
						hud.targetRadius = 0;
					}
				});
				starLabelRenderer = starLabels;

				// --- Black holes ---
				const bhObjects = getObjectsByType(notableObjects, 'blackhole');
				const bhRenderer = new BlackholeRenderer(bhObjects);
				bhRenderer.addTo(layers.far.scene);

				blackholeLabels = new BlackholeLabelRenderer(
					bhObjects as BlackholeNO[],
					canvas,
					{ onSelect: (bh) => {
						hud.selectBlackhole(bh);
						hud.targetPosition = [bh.x * AU_PER_PARSEC, bh.y * AU_PER_PARSEC, bh.z * AU_PER_PARSEC];
						hud.targetRadius = 0;
					}}
				);

				// --- Nebulae ---
				const nebObjects = getObjectsByType(notableObjects, 'nebula');
				nebulaRenderer = new NebulaRenderer(nebObjects);
				nebulaRenderer.addTo(layers.far.scene);

				nebulaLabels = new NebulaLabelRenderer(
					nebObjects as NebulaNO[],
					canvas,
					{ onSelect: (neb) => {
						hud.selectNebula(neb);
						hud.targetPosition = [neb.x * AU_PER_PARSEC, neb.y * AU_PER_PARSEC, neb.z * AU_PER_PARSEC];
						hud.targetRadius = 0;
					}}
				);

				// --- Star clusters ---
				const clusterObjects = getObjectsByType(notableObjects, 'cluster');
				clusterRenderer = new ClusterRenderer(clusterObjects);
				clusterRenderer.addTo(layers.far.scene);

				clusterLabels = new ClusterLabelRenderer(
					clusterObjects as ClusterNO[],
					canvas,
					{ onSelect: (cluster) => {
						hud.selectCluster(cluster);
						hud.targetPosition = [cluster.x * AU_PER_PARSEC, cluster.y * AU_PER_PARSEC, cluster.z * AU_PER_PARSEC];
						hud.targetRadius = 0;
					}}
				);

				// --- Milky Way band + disk ---
				milkyWayRenderer = new MilkyWayRenderer();
				milkyWayRenderer.addBandTo(layers.background.scene);
				milkyWayRenderer.addDiskTo(layers.far.scene);

				// --- Constellation lines ---
				constellationRenderer = new ConstellationRenderer(constellationData, canvas);
				constellationRenderer.addTo(layers.far.scene);
				constellationRenderer.setVisible(false); // off by default (toggle via HUD)

				// --- Galactic plane reference grid ---
				galacticGrid = new GalacticGridRenderer();
				galacticGrid.addTo(layers.far.scene);
				galacticGrid.setVisible(false); // off by default

				// --- Galactic center direction indicator ---
				galacticIndicator = new GalacticIndicatorRenderer(canvas);

				// --- Scale distance markers ---
				scaleMarkers = new ScaleMarkerRenderer(canvas);
				scaleMarkers.addTo(layers.far.scene);
				scaleMarkers.setVisible(false); // off by default

				// Bind star field to warp effects now that it's loaded
				warpEffects?.bind({
					starField,
					postProcessing: siderea.postProcessing,
					cameraController: siderea.cameraController
				});

				// Store catalog refs for search and picking
				starCatalogRef = catalog;
				notableObjectCatalog = notableObjects;
				objectPicker.setStarCatalog(catalog);

				const notableCount = catalog.notable.length;
				starInfo = `${catalog.count.toLocaleString()} stars loaded (${notableCount} notable, ${bhObjects.length} black holes, ${nebObjects.length} nebulae, ${clusterObjects.length} clusters)`;
			})
			.catch((err) => {
				starInfo = `Star load failed: ${err}`;
				updateStage('stars', 'error', String(err));
				updateStage('notable', 'error', String(err));
				console.error('[Siderea] Star/notable catalog load failed:', err);
			});

		// --- BACKGROUND SCENE (backdrop) ---
		const bgMat = new MeshBasicMaterial({ color: 0x0a0a1a });
		const bgGeo = new PlaneGeometry(20, 20);
		const bgPlane = new Mesh(bgGeo, bgMat);
		bgPlane.position.z = -5;
		layers.background.scene.add(bgPlane);

		// Camera starts in orbit mode — pull back to see inner solar system
		siderea.camera.position.set(0, 3, 5);

		// Register scenes for GPU resource auditing
		siderea.perfMonitor?.setScenes([
			{ name: 'Near', scene: layers.near.scene },
			{ name: 'Far', scene: layers.far.scene },
			{ name: 'Background', scene: layers.background.scene }
		]);

		// Performance overlay hidden by default; toggle with ` key in dev mode

		siderea
			.init()
			.then(() => {
				const backend = siderea.renderer.backend?.constructor?.name ?? 'unknown';
				rendererInfo = `Backend: ${backend}`;
				updateStage('renderer', 'done');
				siderea.start();
				// Dismiss loading screen once renderer is running
				loadingVisible = false;

				// URL deep-link: navigate to object encoded in hash (e.g. #/@earth)
				const urlTarget = parseUrlTarget();
				if (urlTarget) {
					// Delay briefly so data catalogs are populated
					setTimeout(() => navigateToByName(urlTarget), 500);
				}
			})
			.catch((err) => {
				rendererInfo = `Error: ${err}`;
				updateStage('renderer', 'error', String(err));
				renderError = String(err);
				console.error('[Siderea] Init failed:', err);
			});

		return () => {
			visibilityManager.dispose();
			approachDetector.clear();
			lightPathRenderer?.dispose();
			geodesicExplorer?.dispose();
			transferRenderer?.dispose();
			selectionHighlight.dispose();
			objectPicker.dispose();
			warpEffects?.dispose();
			scaleMarkers?.dispose();
			galacticIndicator?.dispose();
			galacticGrid?.dispose();
			constellationRenderer?.dispose();
			milkyWayRenderer?.dispose();
			atmosphereRenderer?.dispose();
			probeTrajectoryRenderer?.dispose();
			satelliteRenderer?.dispose();
			clusterLabels?.dispose();
			clusterRenderer?.dispose();
			nebulaLabels?.dispose();
			nebulaRenderer?.dispose();
			blackholeLabels?.dispose();
			starLabels?.dispose();
			starField?.dispose();
			moonOrbitPaths?.dispose();
			moonRenderer?.dispose();
			ringRenderer?.dispose();
			beltRenderer?.dispose();
			smallBodyRenderer?.dispose();
			cometRenderer?.dispose();
			dwarfPlanetRenderer?.dispose();
			planetRenderer?.dispose();
			orbitPaths?.dispose();
			sun.dispose();
			lighting.dispose();
			siderea.dispose();
			bgGeo.dispose();
			bgMat.dispose();
		};
	});
</script>

<svelte:window onkeydown={onKeyDown} />

<svelte:head>
	<title>Siderea</title>
</svelte:head>

<main class:screenshot-mode={screenshotMode}>
	<canvas bind:this={canvas}></canvas>

	<!-- Loading screen (covers canvas until renderer starts) -->
	<LoadingScreen stages={loadingStages} visible={loadingVisible} />

	<!-- Error fallback (shown if renderer init fails) -->
	<ErrorFallback
		visible={!!renderError && !loadingVisible}
		error={renderError ?? ''}
		onretry={() => { renderError = null; window.location.reload(); }}
	/>

	<!-- Welcome overlay (first visit only, shown after loading) -->
	<WelcomeOverlay visible={welcomeVisible && !loadingVisible && !renderError} ondismiss={() => { welcomeVisible = false; }} />
	<KeyboardShortcutsOverlay visible={shortcutsVisible} onclose={() => { shortcutsVisible = false; }} />

	<!-- Bookmarks panel -->
	<BookmarksPanel
		visible={bookmarksVisible}
		onclose={() => { bookmarksVisible = false; }}
		onload={handleBookmarkLoad}
	/>

	<!-- Dev info (only in dev mode) -->
	{#if import.meta.env.DEV}
		<p class="dev-info">WASM: {wasmResult} | Renderer: {rendererInfo} | Stars: {starInfo} | Planets: {planetInfo}</p>
	{/if}

	<HUD state={hud} ontoggleTransfer={() => hud.toggleTransferPanel()} />
	<NavigationHUD state={hud} />
	<SettingsPanel {settings} onupdatetle={handleTleUpdate} {tleFetchStatus} />
	<ApproachToast state={hud} />

	<!-- Time controls -->
	<TimeControls
		clock={simClock}
		timeScale={hud.simTimeScale}
		dateString={hud.simDateString}
		paused={hud.simPaused}
	/>

	<!-- Info panels (only one visible at a time) -->
	{#if hud.selectedStar}
		<StarInfoPanel
			star={hud.selectedStar}
			cameraDistance={hud.targetDistance}
			compact={hud.infoPanelCompact}
			ontogglecompact={() => hud.toggleInfoPanelCompact()}
			onclose={() => hud.deselectStar()}
			onviewlightpath={onViewLightPath}
			onwarp={() => {
				if (hud.targetPosition && sidereaRef) {
					const [x, y, z] = hud.targetPosition;
					sidereaRef.cameraController.warpTo({
						position: new Vector3(x, y, z),
						radius: 0,
						name: hud.selectedStar?.name
					});
				}
			}}
		/>
	{/if}
	{#if hud.selectedBlackhole}
		<BlackholeInfoPanel
			blackhole={hud.selectedBlackhole}
			cameraDistance={hud.targetDistance}
			compact={hud.infoPanelCompact}
			ontogglecompact={() => hud.toggleInfoPanelCompact()}
			onclose={() => hud.deselectBlackhole()}
			onviewlightpath={onViewLightPath}
			onwarp={() => {
				if (hud.targetPosition && sidereaRef) {
					const [x, y, z] = hud.targetPosition;
					sidereaRef.cameraController.warpTo({
						position: new Vector3(x, y, z),
						radius: 0,
						name: hud.selectedBlackhole?.name
					});
				}
			}}
		/>
	{/if}
	{#if hud.selectedBlackhole && hud.geodesicExplorerActive}
		<GeodesicExplorer
			blackhole={hud.selectedBlackhole}
			impactParam={hud.geodesicImpactParam}
			activeInfo={geodesicActiveInfo}
			bhGeometry={geodesicBhGeometry}
			onclose={() => hud.closeGeodesicExplorer()}
			onimpactchange={(ratio) => { hud.geodesicImpactParam = ratio; }}
			onfantoggle={(visible) => { geodesicExplorer?.setFanVisible(visible); }}
		/>
	{/if}
	{#if hud.lightPathInfo}
		<LightPathOverlay
			info={hud.lightPathInfo}
			drawing={hud.lightPathDrawing}
			onclose={() => {
				lightPathRenderer?.clear();
				hud.clearLightPath();
			}}
		/>
	{/if}
	{#if hud.selectedNebula}
		<NebulaInfoPanel
			nebula={hud.selectedNebula}
			cameraDistance={hud.targetDistance}
			compact={hud.infoPanelCompact}
			ontogglecompact={() => hud.toggleInfoPanelCompact()}
			onclose={() => hud.deselectNebula()}
			onviewlightpath={onViewLightPath}
			onwarp={() => {
				if (hud.targetPosition && sidereaRef) {
					const [x, y, z] = hud.targetPosition;
					sidereaRef.cameraController.warpTo({
						position: new Vector3(x, y, z),
						radius: 0,
						name: hud.selectedNebula?.name
					});
				}
			}}
		/>
	{/if}
	{#if hud.selectedCluster}
		<ClusterInfoPanel
			cluster={hud.selectedCluster}
			cameraDistance={hud.targetDistance}
			compact={hud.infoPanelCompact}
			ontogglecompact={() => hud.toggleInfoPanelCompact()}
			onclose={() => hud.deselectCluster()}
			onviewlightpath={onViewLightPath}
			onwarp={() => {
				if (hud.targetPosition && sidereaRef) {
					const [x, y, z] = hud.targetPosition;
					sidereaRef.cameraController.warpTo({
						position: new Vector3(x, y, z),
						radius: 0,
						name: hud.selectedCluster?.name
					});
				}
			}}
		/>
	{/if}
	{#if hud.selectedBody}
		<BodyInfoPanel
			body={hud.selectedBody}
			cameraDistance={hud.targetDistance}
			distanceFromSol={hud.targetPosition ? Math.sqrt(hud.targetPosition[0] ** 2 + hud.targetPosition[1] ** 2 + hud.targetPosition[2] ** 2) : null}
			compact={hud.infoPanelCompact}
			ontogglecompact={() => hud.toggleInfoPanelCompact()}
			simDate={hud.simDateString || undefined}
			onclose={() => { hud.deselectBody(); }}
			onviewlightpath={onViewLightPath}
			onwarp={() => {
				if (hud.targetPosition && sidereaRef) {
					const [x, y, z] = hud.targetPosition;
					sidereaRef.cameraController.warpTo({
						position: new Vector3(x, y, z),
						radius: hud.targetRadius,
						name: hud.selectedBody?.name
					});
				}
			}}
		/>
	{/if}
	{#if hud.selectedSatellite}
		<SatelliteInfoPanel
			satellite={hud.selectedSatellite}
			cameraDistance={hud.targetDistance}
			distanceFromSol={hud.targetPosition ? Math.sqrt(hud.targetPosition[0] ** 2 + hud.targetPosition[1] ** 2 + hud.targetPosition[2] ** 2) : null}
			compact={hud.infoPanelCompact}
			ontogglecompact={() => hud.toggleInfoPanelCompact()}
			{tleFetchedAt}
			onclose={() => { hud.deselectSatellite(); }}
			onwarp={() => {
				if (hud.targetPosition && sidereaRef) {
					const [x, y, z] = hud.targetPosition;
					sidereaRef.cameraController.warpTo({
						position: new Vector3(x, y, z),
						radius: 0,
						name: hud.selectedSatellite?.name
					});
				}
			}}
		/>
	{/if}

	<!-- Search panel -->
	<SearchPanel
		visible={hud.searchVisible}
		search={searchAll}
		onselect={onSearchSelect}
		onclose={() => { hud.searchVisible = false; }}
	/>

	<!-- Target indicator -->
	{#if hud.hasTarget && hud.targetDistance != null && hud.targetName}
		<TargetIndicator
			name={hud.targetName}
			distance={hud.targetDistance}
			screenPos={targetScreenPos}
			offScreenAngle={targetOffScreenAngle}
			inFront={targetInFront}
		/>
	{/if}

	<!-- Transfer orbit planner -->
	{#if hud.transferPanelVisible}
		<TransferPanel
			bodies={transferBodies}
			plan={hud.transferPlan}
			flightState={hud.transferFlightState}
			progress={hud.transferProgress}
			oncompute={computeTransfer}
			onfly={startTransferFlight}
			onclear={clearTransfer}
			onclose={() => { hud.transferPanelVisible = false; }}
		/>
	{/if}

	<!-- Breadcrumb trail -->
	<BreadcrumbTrail
		breadcrumbs={hud.breadcrumbs}
		onback={breadcrumbBack}
		ongoto={breadcrumbGoto}
	/>
</main>

<style>
	:global(body) {
		margin: 0;
		overflow: hidden;
		background: var(--sd-bg, #000);
	}

	main {
		position: relative;
		width: 100vw;
		height: 100vh;
		font-family: var(--sd-font-body, system-ui, sans-serif);
		color: var(--sd-text-bright, #e0e8f0);
		background: var(--sd-bg, #000);
	}

	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}

	.dev-info {
		position: fixed;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		margin: 0;
		padding: 0.25rem 0.75rem;
		font-family: var(--sd-font-mono, monospace);
		font-size: 0.65rem;
		color: var(--sd-text-dim, #6a7c8e);
		background: var(--sd-surface, rgba(10, 12, 20, 0.7));
		border-bottom-left-radius: var(--sd-radius, 4px);
		border-bottom-right-radius: var(--sd-radius, 4px);
		z-index: var(--sd-z-hud, 100);
		pointer-events: none;
		white-space: nowrap;
	}

	/* Responsive: scale down dev info on smaller screens */
	@media (max-width: 768px) {
		.dev-info {
			font-size: 0.55rem;
			max-width: 90vw;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}

	/* Screenshot mode: hide all UI overlays except canvas */
	main.screenshot-mode :global(*:not(canvas)) {
		visibility: hidden !important;
	}
	main.screenshot-mode canvas {
		visibility: visible !important;
	}
</style>
