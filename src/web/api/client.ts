export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: any,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  // Si estamos guardando token en localStorage como fallback
  const token = localStorage.getItem('rh_token');
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...options,
      headers,
      credentials: 'same-origin',
    });
  } catch (err: any) {
    // Error de red / sin conexión
    throw new ApiClientError(
      0,
      'NETWORK_ERROR',
      'No hay conexión con el servidor. Comprobá tu conexión a internet o el estado de la red.',
    );
  }

  // Manejo de CSV y binarios
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/csv')) {
    if (!res.ok) throw new ApiClientError(res.status, 'DOWNLOAD_ERROR', 'Error al descargar archivo CSV.');
    return (await res.text()) as unknown as T;
  }

  const json = (await res.json().catch(() => ({}))) as any;

  if (!res.ok) {
    const errPayload = json?.error;
    throw new ApiClientError(
      res.status,
      errPayload?.code || 'UNKNOWN_ERROR',
      errPayload?.message || `Error del servidor (${res.status})`,
      errPayload?.details,
    );
  }

  return json as T;
}
