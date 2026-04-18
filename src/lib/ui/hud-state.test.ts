import { describe, it, expect } from 'vitest';
import { createHudState, SIZE_EXAGGERATION_VALUES } from './hud-state.svelte';

describe('createHudState', () => {
	it('initializes with default values', () => {
		const state = createHudState();
		expect(state.sizeMode).toBe('visible');
		expect(state.sizeExaggeration).toBe(SIZE_EXAGGERATION_VALUES.visible);
		expect(state.cameraDistance).toBe(0);
		expect(state.hudVisible).toBe(true);
		expect(state.orbitVisibility.planets).toBe(true);
		expect(state.orbitVisibility.moons).toBe(true);
		expect(state.beltVisibility.asteroidBelt).toBe(true);
		expect(state.beltVisibility.kuiperBelt).toBe(true);
	});

	it('toggleSizeMode switches between visible and real', () => {
		const state = createHudState();
		expect(state.sizeMode).toBe('visible');

		state.toggleSizeMode();
		expect(state.sizeMode).toBe('real');
		expect(state.sizeExaggeration).toBe(SIZE_EXAGGERATION_VALUES.real);

		state.toggleSizeMode();
		expect(state.sizeMode).toBe('visible');
		expect(state.sizeExaggeration).toBe(SIZE_EXAGGERATION_VALUES.visible);
	});

	it('toggleOrbitCategory flips individual categories', () => {
		const state = createHudState();
		expect(state.orbitVisibility.comets).toBe(true);

		state.toggleOrbitCategory('comets');
		expect(state.orbitVisibility.comets).toBe(false);
		// Other categories unchanged
		expect(state.orbitVisibility.planets).toBe(true);

		state.toggleOrbitCategory('comets');
		expect(state.orbitVisibility.comets).toBe(true);
	});

	it('toggleBelt flips belt visibility', () => {
		const state = createHudState();
		state.toggleBelt('asteroidBelt');
		expect(state.beltVisibility.asteroidBelt).toBe(false);
		expect(state.beltVisibility.kuiperBelt).toBe(true);
	});

	it('allows direct property setting', () => {
		const state = createHudState();
		state.cameraDistance = 42.5;
		expect(state.cameraDistance).toBe(42.5);

		state.hudVisible = false;
		expect(state.hudVisible).toBe(false);
	});

	it('initializes galactic visibility with correct defaults', () => {
		const state = createHudState();
		expect(state.galacticVisibility.milkyWay).toBe(true);
		expect(state.galacticVisibility.galacticPlane).toBe(false);
		expect(state.galacticVisibility.galacticCenter).toBe(true);
		expect(state.galacticVisibility.scaleMarkers).toBe(false);
	});

	it('toggleGalactic flips individual galactic overlays', () => {
		const state = createHudState();
		expect(state.galacticVisibility.galacticPlane).toBe(false);

		state.toggleGalactic('galacticPlane');
		expect(state.galacticVisibility.galacticPlane).toBe(true);
		// Other layers unchanged
		expect(state.galacticVisibility.milkyWay).toBe(true);

		state.toggleGalactic('galacticPlane');
		expect(state.galacticVisibility.galacticPlane).toBe(false);
	});

	it('selectBody clears other selections', () => {
		const state = createHudState();
		state.selectStar({ name: 'Sirius', index: 0, spectral: 'A1V', constellation: 'CMa', ra: 0, dec: 0, dist: 2.64, mag: -1.46, absmag: 1.42, bv: 0 });
		expect(state.selectedStar).not.toBeNull();

		state.selectBody(
			{ id: 'earth', name: 'Earth', naif_id: 3, type: 'planet', parent_id: 'sun', mass_kg: 5.972e24, radius_km: 6371, radius_mean_km: 6371, axial_tilt_deg: 23.44, rotation_period_hours: 23.93, surface_gravity_m_s2: 9.81, orbital_period_days: 365.25, atmosphere: null, rings: null, notable_features: [], description: 'Home', texture_ref: null },
			[1, 0, 0],
			0.001
		);
		expect(state.selectedBody?.name).toBe('Earth');
		expect(state.selectedStar).toBeNull();
		expect(state.targetPosition).toEqual([1, 0, 0]);
	});

	it('deselectBody clears target', () => {
		const state = createHudState();
		state.selectBody(
			{ id: 'mars', name: 'Mars', naif_id: 4, type: 'planet', parent_id: 'sun', mass_kg: 6.39e23, radius_km: 3396, radius_mean_km: 3390, axial_tilt_deg: 25.19, rotation_period_hours: 24.62, surface_gravity_m_s2: 3.72, orbital_period_days: 687, atmosphere: null, rings: null, notable_features: [], description: 'Red planet', texture_ref: null },
			[1.5, 0, 0],
			0.0005
		);
		expect(state.hasTarget).toBe(true);
		state.deselectBody();
		expect(state.selectedBody).toBeNull();
		expect(state.targetPosition).toBeNull();
	});

	it('deselectAll clears everything', () => {
		const state = createHudState();
		state.selectStar({ name: 'Sirius', index: 0, spectral: 'A1V', constellation: 'CMa', ra: 0, dec: 0, dist: 2.64, mag: -1.46, absmag: 1.42, bv: 0 });
		expect(state.hasTarget).toBe(true);
		state.deselectAll();
		expect(state.hasTarget).toBe(false);
		expect(state.selectedStar).toBeNull();
	});

	it('breadcrumb trail pushes and pops', () => {
		const state = createHudState();
		expect(state.breadcrumbs).toHaveLength(0);

		state.pushBreadcrumb({ name: 'Earth', kind: 'body', position: [1, 0, 0], radius: 0.001 });
		state.pushBreadcrumb({ name: 'Mars', kind: 'body', position: [1.5, 0, 0], radius: 0.0005 });
		expect(state.breadcrumbs).toHaveLength(2);
		expect(state.breadcrumbs[1].name).toBe('Mars');

		const popped = state.popBreadcrumb();
		expect(popped?.name).toBe('Mars');
		expect(state.breadcrumbs).toHaveLength(1);
	});

	it('breadcrumb trail deduplicates consecutive entries', () => {
		const state = createHudState();
		state.pushBreadcrumb({ name: 'Earth', kind: 'body', position: [1, 0, 0], radius: 0.001 });
		state.pushBreadcrumb({ name: 'Earth', kind: 'body', position: [1, 0, 0], radius: 0.001 });
		expect(state.breadcrumbs).toHaveLength(1);
	});

	it('search visibility toggles', () => {
		const state = createHudState();
		expect(state.searchVisible).toBe(false);
		state.toggleSearch();
		expect(state.searchVisible).toBe(true);
		state.toggleSearch();
		expect(state.searchVisible).toBe(false);
	});

	it('targetName returns name of selected object', () => {
		const state = createHudState();
		expect(state.targetName).toBeNull();

		state.selectBody(
			{ id: 'earth', name: 'Earth', naif_id: 3, type: 'planet', parent_id: 'sun', mass_kg: 5.972e24, radius_km: 6371, radius_mean_km: 6371, axial_tilt_deg: 23.44, rotation_period_hours: 23.93, surface_gravity_m_s2: 9.81, orbital_period_days: 365.25, atmosphere: null, rings: null, notable_features: [], description: 'Home', texture_ref: null },
			[1, 0, 0],
			0.001
		);
		expect(state.targetName).toBe('Earth');
	});

	it('geodesic explorer defaults to inactive', () => {
		const state = createHudState();
		expect(state.geodesicExplorerActive).toBe(false);
		expect(state.geodesicImpactParam).toBe(1.5);
	});

	it('toggleGeodesicExplorer requires selected blackhole', () => {
		const state = createHudState();
		state.toggleGeodesicExplorer();
		// No blackhole selected — should remain inactive
		expect(state.geodesicExplorerActive).toBe(false);
	});

	it('toggleGeodesicExplorer activates with selected blackhole', () => {
		const state = createHudState();
		const bh = {
			id: 'sgr-a-star', name: 'Sgr A*', type: 'blackhole' as const,
			subtype: 'supermassive' as const, mass_solar: 4_154_000,
			catalog_ids: [], ra: 266.42, dec: -29.01, dist_pc: 8178,
			x: 0, y: 0, z: -8178, description: '', texture_ref: null
		};
		state.selectBlackhole(bh);
		state.toggleGeodesicExplorer();
		expect(state.geodesicExplorerActive).toBe(true);

		state.toggleGeodesicExplorer();
		expect(state.geodesicExplorerActive).toBe(false);
		expect(state.geodesicImpactParam).toBe(1.5); // reset
	});

	it('deselectBlackhole closes geodesic explorer', () => {
		const state = createHudState();
		const bh = {
			id: 'sgr-a-star', name: 'Sgr A*', type: 'blackhole' as const,
			subtype: 'supermassive' as const, mass_solar: 4_154_000,
			catalog_ids: [], ra: 266.42, dec: -29.01, dist_pc: 8178,
			x: 0, y: 0, z: -8178, description: '', texture_ref: null
		};
		state.selectBlackhole(bh);
		state.toggleGeodesicExplorer();
		expect(state.geodesicExplorerActive).toBe(true);

		state.deselectBlackhole();
		expect(state.geodesicExplorerActive).toBe(false);
	});

	it('infoPanelCompact defaults to false and toggles', () => {
		const state = createHudState();
		expect(state.infoPanelCompact).toBe(false);

		state.toggleInfoPanelCompact();
		expect(state.infoPanelCompact).toBe(true);

		state.toggleInfoPanelCompact();
		expect(state.infoPanelCompact).toBe(false);
	});

	it('infoPanelCompact can be set directly', () => {
		const state = createHudState();
		state.infoPanelCompact = true;
		expect(state.infoPanelCompact).toBe(true);
	});

	it('deselectAll closes geodesic explorer', () => {
		const state = createHudState();
		const bh = {
			id: 'sgr-a-star', name: 'Sgr A*', type: 'blackhole' as const,
			subtype: 'supermassive' as const, mass_solar: 4_154_000,
			catalog_ids: [], ra: 266.42, dec: -29.01, dist_pc: 8178,
			x: 0, y: 0, z: -8178, description: '', texture_ref: null
		};
		state.selectBlackhole(bh);
		state.toggleGeodesicExplorer();
		state.geodesicImpactParam = 2.5;

		state.deselectAll();
		expect(state.geodesicExplorerActive).toBe(false);
		expect(state.geodesicImpactParam).toBe(1.5);
	});

	it('activateLightPath sets path info and drawing state', () => {
		const state = createHudState();
		const mockResult = {
			points: [0, 0, 0, 1, 0, 0],
			total_distance: 9.461e15,
			travel_time: 31557600,
			straight_line_distance: 9.461e15,
			total_deflection: 1.75e-6,
			deflections: []
		};
		state.activateLightPath('Sirius', [1, 2, 3], mockResult);
		expect(state.lightPathVisible).toBe(true);
		expect(state.lightPathSource).toBe('Sirius');
		expect(state.lightPathDrawing).toBe(true);
		expect(state.lightPathInfo).not.toBeNull();
		expect(state.lightPathInfo!.sourceName).toBe('Sirius');
		expect(state.lightPathInfo!.sourcePositionAU).toEqual([1, 2, 3]);
		expect(state.lightPathInfo!.result).toBe(mockResult);
	});

	it('clearLightPath resets all light path state', () => {
		const state = createHudState();
		state.activateLightPath('Sirius', [1, 2, 3], {
			points: [], total_distance: 0, travel_time: 0,
			straight_line_distance: 0, total_deflection: 0, deflections: []
		});
		state.clearLightPath();
		expect(state.lightPathVisible).toBe(false);
		expect(state.lightPathSource).toBeNull();
		expect(state.lightPathDrawing).toBe(false);
		expect(state.lightPathInfo).toBeNull();
	});

	it('toggleLightPath off clears light path info', () => {
		const state = createHudState();
		state.activateLightPath('Alpha Centauri', [0, 0, 1], {
			points: [], total_distance: 0, travel_time: 0,
			straight_line_distance: 0, total_deflection: 0, deflections: []
		});
		state.toggleLightPath(); // toggles off since lightPathVisible is true
		expect(state.lightPathVisible).toBe(false);
		expect(state.lightPathInfo).toBeNull();
		expect(state.lightPathDrawing).toBe(false);
	});
});
