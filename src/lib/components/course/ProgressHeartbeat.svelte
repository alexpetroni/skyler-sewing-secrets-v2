<script lang="ts">
	import { untrack } from 'svelte';

	interface Props {
		lessonId: string;
		/** Where playback resumed, in seconds; the fallback timer counts on from here. */
		startAt?: number;
		/** Caps the fallback timer's estimate; null when Bunny has not reported it. */
		durationSeconds?: number | null;
	}

	let { lessonId, startAt = 0, durationSeconds = null }: Props = $props();

	/** Never more than one POST per interval, whichever source drives it. */
	const INTERVAL_MS = 15_000;
	const PLAYER_ORIGIN = 'https://iframe.mediadelivery.net';
	const PLAYER_EVENTS = ['timeupdate', 'pause'];

	interface PlayerMessage {
		context?: string;
		event?: string;
		value?: { seconds?: number };
	}

	/** player.js messages arrive as JSON strings or objects; anything else is ignored. */
	function parseMessage(data: unknown): PlayerMessage | null {
		let message: unknown = data;
		if (typeof data === 'string') {
			try {
				message = JSON.parse(data);
			} catch {
				return null;
			}
		}
		if (typeof message !== 'object' || message === null) return null;
		const candidate = message as PlayerMessage;
		return candidate.context === 'player.js' ? candidate : null;
	}

	$effect(() => {
		const id = lessonId;
		// Only a new lesson restarts the heartbeat; prop refreshes on the same page do not.
		let position = Math.floor(untrack(() => startAt));
		let lastPostAt = 0;
		let lastPosted = position;
		// Once the player reports positions, the fallback timer stands down.
		let playerReports = false;

		function post(seconds: number) {
			const now = Date.now();
			if (seconds === lastPosted || now - lastPostAt < INTERVAL_MS) return;
			lastPostAt = now;
			lastPosted = seconds;
			// Best effort: a missed heartbeat only costs a few seconds of resume position.
			fetch('/api/progress', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ lessonId: id, positionSeconds: seconds }),
				keepalive: true
			}).catch(() => undefined);
		}

		function onMessage(event: MessageEvent) {
			if (event.origin !== PLAYER_ORIGIN) return;
			const message = parseMessage(event.data);
			if (!message) return;
			if (message.event === 'ready' && event.source) {
				for (const name of PLAYER_EVENTS) {
					(event.source as Window).postMessage(
						JSON.stringify({ context: 'player.js', method: 'addEventListener', value: name }),
						PLAYER_ORIGIN
					);
				}
				return;
			}
			const seconds = message.value?.seconds;
			if ((message.event === 'timeupdate' || message.event === 'pause') && seconds !== undefined) {
				playerReports = true;
				position = Math.floor(seconds);
				post(position);
			}
		}

		const timer = setInterval(() => {
			if (playerReports || document.visibilityState !== 'visible') return;
			position += INTERVAL_MS / 1000;
			if (durationSeconds) position = Math.min(position, durationSeconds);
			post(position);
		}, INTERVAL_MS);
		window.addEventListener('message', onMessage);

		return () => {
			clearInterval(timer);
			window.removeEventListener('message', onMessage);
		};
	});
</script>
