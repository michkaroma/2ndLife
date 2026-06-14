// src/lib/client/push.ts — abonnement/désabonnement Web Push côté client.

function urlBase64ToUint8Array(base64: string): Uint8Array {
	const padding = '='.repeat((4 - (base64.length % 4)) % 4);
	const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(b64);
	return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export type PushState = 'unsupported' | 'denied' | 'default' | 'subscribed' | 'unconfigured';

export async function getPushState(): Promise<PushState> {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window))
		return 'unsupported';
	if (Notification.permission === 'denied') return 'denied';
	const reg = await navigator.serviceWorker.ready;
	const sub = await reg.pushManager.getSubscription();
	return sub ? 'subscribed' : 'default';
}

export async function enablePush(): Promise<PushState> {
	if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
	const { publicKey, configured } = await fetch('/api/push/vapid').then((r) => r.json());
	if (!configured || !publicKey) return 'unconfigured';

	const perm = await Notification.requestPermission();
	if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'default';

	const reg = await navigator.serviceWorker.ready;
	let sub = await reg.pushManager.getSubscription();
	if (!sub) {
		sub = await reg.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
		});
	}
	await fetch('/api/push/subscribe', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(sub)
	});
	return 'subscribed';
}

export async function disablePush(): Promise<void> {
	const reg = await navigator.serviceWorker.ready;
	const sub = await reg.pushManager.getSubscription();
	if (sub) {
		await fetch('/api/push/unsubscribe', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ endpoint: sub.endpoint })
		});
		await sub.unsubscribe();
	}
}
