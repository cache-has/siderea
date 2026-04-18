/**
 * Renderer module — Three.js scene management, multi-scale rendering, and post-processing.
 */

export { SidereaRenderer, type RendererOptions } from './renderer';
export { PostProcessingPipeline, type PostProcessingOptions } from './post-processing';
export { SceneLayerManager, SceneLayer, type SceneLayerConfig } from './scene-layers';
export {
	CameraController,
	CameraMode,
	type CameraControllerOptions,
	type CameraState,
	type FollowTargetProvider
} from './camera-controller';
export {
	TouchHandler,
	type TouchHandlerCallbacks,
	type TouchHandlerOptions
} from './touch-handler';
export {
	ScaleSpace,
	AU_PER_PARSEC,
	METERS_PER_AU,
	METERS_PER_PARSEC,
	nearToFar,
	farToNear,
	metersToUnit,
	unitToMeters
} from './scale';
export {
	StarFieldRenderer,
	cameraDistanceToMagCutoff,
	type StarFieldOptions,
	type StarLODThresholds
} from './star-field';
export { StarLabelRenderer, type StarLabelOptions } from './star-labels';
export {
	PerformanceMonitor,
	type PerformanceMonitorOptions,
	type PerformanceStats
} from './performance-monitor';
export {
	SolarSystemLighting,
	type SolarLightingOptions
} from './solar-lighting';
export {
	ObjectPool,
	GeometryCache,
	SceneObjectPool,
	type PoolOptions,
	type SceneObjectPoolOptions
} from './object-pool';
export {
	SunRenderer,
	SUN_RADIUS_AU,
	type SunRendererOptions
} from './sun';
export {
	PlanetRenderer,
	dateToJD,
	type PlanetRendererOptions,
	type WasmEphemeris
} from './planets';
export {
	OrbitPathRenderer,
	type OrbitPathRendererOptions,
	type WasmOrbitPath
} from './orbit-paths';
export {
	createPlanetMaterial,
	createEarthCloudMaterial,
	type PlanetMaterialResult
} from './planet-materials';
export {
	RingRenderer,
	type RingRendererOptions
} from './ring-renderer';
export {
	DwarfPlanetRenderer,
	type DwarfPlanetRendererOptions
} from './dwarf-planets';
export {
	MoonRenderer,
	type MoonRendererOptions,
	type WasmMoonEphemeris
} from './moons';
export {
	MoonOrbitPathRenderer,
	type MoonOrbitPathRendererOptions,
	type WasmMoonOrbitPath
} from './moon-orbit-paths';
export {
	CometRenderer,
	type CometRendererOptions
} from './comets';
export {
	BeltRenderer,
	type BeltRendererOptions,
	type BeltConfig
} from './belt-renderer';
export {
	SmallBodyRenderer,
	type SmallBodyRendererOptions
} from './small-body-renderer';
export {
	SatelliteRenderer,
	loadSnapshotTles,
	updateTles,
	getActiveTle,
	type SatelliteRendererOptions,
	type WasmSatelliteEphemeris
} from './satellites';
export {
	AtmosphereRenderer,
	type AtmosphereRendererOptions
} from './atmosphere-renderer';
export {
	BlackholeRenderer,
	schwarzschildRadiusKm,
	type BlackholeRendererOptions
} from './blackhole-renderer';
export {
	BlackholeLabelRenderer,
	type BlackholeLabelOptions
} from './blackhole-labels';
export {
	NebulaRenderer,
	angularToPhysicalPc,
	type NebulaRendererOptions
} from './nebula-renderer';
export {
	NebulaLabelRenderer,
	type NebulaLabelOptions
} from './nebula-labels';
export {
	ClusterRenderer,
	type ClusterRendererOptions
} from './cluster-renderer';
export {
	ClusterLabelRenderer,
	type ClusterLabelOptions
} from './cluster-labels';
export {
	GALACTIC_NORTH_POLE,
	GALACTIC_CENTER_DIR,
	GALACTIC_CENTER_POS,
	GALACTIC_CENTER_DIST_PC,
	GALACTIC_PLANE_QUATERNION,
	ECLIPTIC_NORTH_POLE,
	DISK_RADIUS_PC,
	DISK_SCALE_LENGTH_PC,
	DISK_SCALE_HEIGHT_PC,
	SOL_Z_OFFSET_PC,
	LY_PER_PARSEC,
	pcToLy,
	lyToPc,
	galacticLatitude,
	galacticLongitude,
	eclipticLatitude,
	eclipticLongitude
} from './galactic-constants';
export {
	MilkyWayRenderer,
	type MilkyWayRendererOptions
} from './milkyway-renderer';
export {
	GalacticGridRenderer,
	type GalacticGridOptions
} from './galactic-grid';
export {
	ConstellationRenderer,
	type ConstellationRendererOptions
} from './constellation-renderer';
export {
	GalacticIndicatorRenderer,
	type GalacticIndicatorOptions
} from './galactic-indicator';
export {
	ScaleMarkerRenderer,
	type ScaleMarkerOptions
} from './scale-markers';
export {
	WarpController,
	WarpPhase,
	type WarpTarget,
	type WarpOptions,
	type WarpState,
	type WarpObstacle
} from './warp-controller';
export {
	FramePositionCache,
	type WasmBatchEphemeris,
	type CachedPosition
} from './frame-position-cache';
export {
	WarpEffects,
	type WarpEffectsOptions
} from './warp-effects';
export {
	SelectionHighlight,
	type SelectionHighlightOptions
} from './selection-highlight';
export {
	TransferOrbitRenderer,
	type HohmannResult,
	type TransferPlan
} from './transfer-orbit';
export {
	LightPathRenderer,
	type LightPathRendererOptions,
	type WasmLightPath,
	type LightPathWasmResult
} from './light-path-renderer';
export {
	GeodesicExplorerRenderer,
	type ActiveGeodesicInfo,
	type TrajectoryType
} from './geodesic-explorer-renderer';
export {
	DistanceLabelRenderer,
	meshPositionGetter,
	originPositionGetter,
	type DistancePair,
	type DistanceLabelOptions
} from './distance-labels';
export {
	ProbeTrajectoryRenderer,
	type ProbeTrajectoryRendererOptions
} from './probe-trajectories';
export {
	computeDarkAdaptation,
	smoothAdaptation,
	type DarkAdaptationFactors
} from './dark-adaptation';
