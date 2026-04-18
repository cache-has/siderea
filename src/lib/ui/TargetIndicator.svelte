<script lang="ts">
	interface Props {
		/** Name of the target. */
		name: string;
		/** Distance to target in AU. */
		distance: number;
		/** Screen position of target [x, y] in CSS pixels, null if off-screen. */
		screenPos: [number, number] | null;
		/** Direction angle in radians (from center of screen) when off-screen. */
		offScreenAngle: number | null;
		/** Whether the target is in front of the camera. */
		inFront: boolean;
	}

	const { name, distance, screenPos, offScreenAngle, inFront }: Props = $props();

	/** Format distance in appropriate units. */
	function formatDistance(au: number): string {
		if (au < 0.001) {
			const km = au * 149_597_870.7;
			return `${km.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km`;
		}
		if (au < 0.1) {
			return `${(au * 149_597_870.7 / 1e6).toFixed(3)} M km`;
		}
		if (au < 100) {
			return `${au.toFixed(3)} AU`;
		}
		return `${au.toFixed(1)} AU`;
	}

	const MARGIN = 40; // px from screen edge

	/** Compute the position of the off-screen arrow indicator. */
	function arrowStyle(angle: number): string {
		if (typeof window === 'undefined') return '';
		const w = window.innerWidth;
		const h = window.innerHeight;
		const cx = w / 2;
		const cy = h / 2;

		// Project direction to screen edge
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);

		// Find where ray from center hits the margin rect
		const maxX = cx - MARGIN;
		const maxY = cy - MARGIN;

		let t = Infinity;
		if (cos !== 0) t = Math.min(t, Math.abs(maxX / cos));
		if (sin !== 0) t = Math.min(t, Math.abs(maxY / sin));

		const x = cx + cos * t;
		const y = cy + sin * t;
		const rotation = angle * (180 / Math.PI) + 90; // arrow points toward target

		return `left:${x}px;top:${y}px;transform:translate(-50%,-50%) rotate(${rotation}deg)`;
	}
</script>

<!-- On-screen crosshair at target position -->
{#if screenPos && inFront}
	<div class="target-reticle" style="left:{screenPos[0]}px;top:{screenPos[1]}px">
		<div class="reticle-ring"></div>
		<div class="reticle-label">
			<span class="reticle-name">{name}</span>
			<span class="reticle-dist">{formatDistance(distance)}</span>
		</div>
	</div>
{/if}

<!-- Off-screen direction indicator -->
{#if offScreenAngle != null && !screenPos}
	<div class="offscreen-arrow" style={arrowStyle(offScreenAngle)}>
		<span class="arrow-chevron">&#x25B2;</span>
		<span class="arrow-label">{name} &middot; {formatDistance(distance)}</span>
	</div>
{/if}

<style>
	.target-reticle {
		position: fixed;
		pointer-events: none;
		z-index: 150;
		transform: translate(-50%, -50%);
	}

	.reticle-ring {
		width: 24px;
		height: 24px;
		border: 1px solid rgba(80, 160, 255, 0.6);
		border-radius: 50%;
		margin: 0 auto;
		animation: pulse-ring 2s ease-in-out infinite;
	}

	@keyframes pulse-ring {
		0%, 100% { opacity: 0.6; transform: scale(1); }
		50% { opacity: 1; transform: scale(1.15); }
	}

	.reticle-label {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-top: 4px;
		white-space: nowrap;
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 0.6rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.reticle-name {
		color: #a0c8f0;
		font-weight: 500;
	}

	.reticle-dist {
		color: #6a7c8e;
		font-size: 0.55rem;
	}

	.offscreen-arrow {
		position: fixed;
		pointer-events: none;
		z-index: 150;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}

	.arrow-chevron {
		color: rgba(80, 160, 255, 0.7);
		font-size: 0.9rem;
		text-shadow: 0 0 6px rgba(80, 160, 255, 0.3);
	}

	.arrow-label {
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 0.55rem;
		color: #7090b0;
		white-space: nowrap;
	}
</style>
