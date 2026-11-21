export class ApiRequestError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Cannot reach the server. Is the API running?');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiRequestError(res.status, e?.code ?? 'ERROR', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return data;
}

export const api = {
  listMovies: () => request('GET', '/movies'),
  createMovie: (movie) => request('POST', '/movies', movie),
  updateMovie: (id, changes) => request('PATCH', `/movies/${id}`, changes),
  rewatchOrder: (id) => request('GET', `/movies/${id}/rewatch-order`),
  listCinemas: () => request('GET', '/cinemas'),
  createCinema: (cinema) => request('POST', '/cinemas', cinema),
  booking: (cinemaId, groupSize) => request('GET', `/cinemas/${cinemaId}/booking?groupSize=${encodeURIComponent(groupSize)}`),
  loadSampleData: () => request('POST', '/seed'),
};

/** 150 -> "2h 30m" */
export function formatMinutes(total) {
  if (total <= 0) return '0m';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
}

/** Message plus a field-by-field list for validation errors. */
export function describeError(err) {
  const fields = Array.isArray(err.details) ? err.details.map((d) => d.message) : [];
  return fields.length ? fields.join(' · ') : err.message;
}
