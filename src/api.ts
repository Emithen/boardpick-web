export type Game = {
  id: number;
  name: string;
  minPlayer: number;
  maxPlayer: number;
  category: string;
  playTimeMinutes: number;
  difficulty: number;
};

export type GameInput = Omit<Game, 'id'>;
export type GameList = {
  id: number;
  memberId: number;
  name: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
};
export type Member = { id: number; loginId: string; nickname: string };
export type Filters = { keyword: string; players: string; category: string; maxPlayTime: string };

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'include',
      ...init,
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers }
    });
  } catch {
    throw new ApiError('서버에 연결할 수 없습니다. 백엔드 실행 상태를 확인해주세요.', 0);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!response.ok) {
    const message = typeof data === 'object' && data
      ? data.detail || data.message || data.error
      : typeof data === 'string' ? data : '';
    throw new ApiError(message || fallbackMessage(response.status), response.status);
  }
  return data as T;
}

function fallbackMessage(status: number) {
  if (status === 401) return '로그인이 필요합니다.';
  if (status === 403) return '이 작업을 할 권한이 없습니다.';
  if (status === 404) return '조건에 맞는 게임이 없습니다.';
  if (status === 409) return '이미 사용 중인 값입니다.';
  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.';
}

function query(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value.trim()) params.set(key, value.trim());
  return params.size ? `?${params}` : '';
}

export const api = {
  games: (filters: Filters) => request<Game[]>(`/api/games${query(filters)}`),
  pick: (filters: Filters) => request<Game>(`/api/games/pick${query(filters)}`),
  lists: () => request<GameList[]>('/api/lists'),
  listGames: (id: number, filters: Filters) => request<Game[]>(`/api/lists/${id}/games${query(filters)}`),
  listPick: (id: number, filters: Filters) => request<Game>(`/api/lists/${id}/pick${query(filters)}`),
  me: () => request<Member>('/api/members/me'),
  login: (loginId: string, password: string) => request<Member>('/api/members/login', { method: 'POST', body: JSON.stringify({ loginId, password }) }),
  signup: (loginId: string, nickname: string, password: string) => request<Member>('/api/members', { method: 'POST', body: JSON.stringify({ loginId, nickname, password }) }),
  logout: () => request<void>('/api/members/login', { method: 'DELETE' }),
  addToMine: (id: number) => request<Game>(`/api/lists/me/games/${id}`, { method: 'POST' }),
  removeFromMine: (id: number) => request<void>(`/api/lists/me/games/${id}`, { method: 'DELETE' }),
  createGame: (game: GameInput) => request<Game>('/api/games', { method: 'POST', body: JSON.stringify(game) }),
  updateGame: (id: number, game: GameInput) => request<Game>(`/api/games/${id}`, { method: 'PUT', body: JSON.stringify(game) }),
  deleteGame: (id: number) => request<void>(`/api/games/${id}`, { method: 'DELETE' })
};
