export const onRequest: PagesFunction = async ({ request }) => {
	const url = new URL(request.url);
	const upstream = new URL('https://exoplanetarchive.ipac.caltech.edu/TAP/sync');
	upstream.search = url.search;

	const response = await fetch(upstream.toString());
	const body = await response.text();

	return new Response(body, {
		status: response.status,
		headers: {
			'Content-Type': response.headers.get('Content-Type') || 'text/plain',
			'Access-Control-Allow-Origin': '*',
		},
	});
};
