import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownRight, ArrowLeft, ArrowRight, Check, ChevronDown, Clock3, Dices,
  Heart, Layers3, LogOut, Menu, Pencil, Plus, Search, Shuffle, SlidersHorizontal,
  Sparkles, Trash2, UsersRound, X
} from 'lucide-react';
import { api, ApiError, type Filters, type Game, type GameInput, type GameList, type Member } from './api';

type Page = 'discover' | 'lists' | 'mine' | 'admin';
type AuthMode = 'login' | 'signup';
const emptyFilters: Filters = { keyword: '', players: '', category: '', maxPlayTime: '' };
const emptyGame: GameInput = { name: '', minPlayer: 2, maxPlayer: 4, category: '', playTimeMinutes: 30, difficulty: 2 };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '잠시 후 다시 시도해주세요.';
}

function difficultyLabel(value: number) {
  return ['입문', '가벼움', '보통', '전략', '고난도'][Math.max(0, Math.min(4, value - 1))];
}

function initials(value: string) {
  const words = value.trim().split(/\s+/);
  return words.length > 1 ? words.slice(0, 2).map(word => word[0]).join('').toUpperCase() : value.trim().slice(0, 2).toUpperCase();
}

function colorIndex(category: string) {
  return [...category].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 5;
}

function App() {
  const [page, setPage] = useState<Page>('discover');
  const [member, setMember] = useState<Member | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [allGames, setAllGames] = useState<Game[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [lists, setLists] = useState<GameList[]>([]);
  const [mineGames, setMineGames] = useState<Game[]>([]);
  const [selectedList, setSelectedList] = useState<GameList | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Game | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);

  const isAdmin = member?.loginId === 'admin';
  const myList = lists.find(list => list.memberId === member?.id) ?? null;
  const visibleLists = lists.filter(list => list.isPublic || list.memberId === member?.id);
  const savedIds = useMemo(() => new Set(mineGames.map(game => game.id)), [mineGames]);
  const categories = useMemo(() => [...new Set(allGames.map(game => game.category).filter(Boolean))].sort(), [allGames]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(current => current === message ? '' : current), 4200);
  }, []);

  const refreshCatalog = useCallback(async () => {
    const [nextGames, nextLists] = await Promise.all([api.games(emptyFilters), api.lists()]);
    setAllGames(nextGames);
    setLists(nextLists);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([api.games(emptyFilters), api.lists(), api.me().catch(() => null)])
      .then(([initialGames, initialLists, currentMember]) => {
        if (!active) return;
        setAllGames(initialGames);
        setGames(initialGames);
        setLists(initialLists);
        setMember(currentMember);
      })
      .catch(error => { if (active) notify(errorMessage(error)); })
      .finally(() => { if (active) { setSessionReady(true); setLoading(false); } });
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauthError') === 'true') {
      notify('Google 로그인에 실패했습니다. 다시 시도해주세요.');
      params.delete('oauthError');
      history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
    }
    return () => { active = false; };
  }, [notify]);

  useEffect(() => {
    if (!sessionReady || !member) { setMineGames([]); return; }
    const list = lists.find(item => item.memberId === member.id);
    if (!list) { setMineGames([]); return; }
    let active = true;
    api.listGames(list.id, emptyFilters)
      .then(data => { if (active) setMineGames(data); })
      .catch(error => { if (active) notify(errorMessage(error)); });
    return () => { active = false; };
  }, [sessionReady, member, lists, notify]);

  useEffect(() => {
    if (!sessionReady) return;
    if (page !== 'discover' && page !== 'lists') return;
    if (page === 'lists' && !selectedList) return;
    let active = true;
    setLoading(true);
    const promise = page === 'lists' && selectedList
      ? api.listGames(selectedList.id, appliedFilters)
      : api.games(appliedFilters);
    promise.then(data => { if (active) setGames(data); })
      .catch(error => { if (active) notify(errorMessage(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, selectedList, appliedFilters, sessionReady, notify]);

  function navigate(next: Page) {
    if (next === 'mine' && !member) { setAuthMode('login'); return; }
    if (next === 'admin' && !isAdmin) return;
    setPage(next);
    setSelectedList(null);
    setAppliedFilters(emptyFilters);
    setFilters(emptyFilters);
    setPicked(null);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function refreshMine(list: GameList | null = myList) {
    if (!list) return;
    setMineGames(await api.listGames(list.id, emptyFilters));
  }

  async function toggleSaved(game: Game) {
    if (!member) { setAuthMode('login'); return; }
    if (!myList) { notify('내 리스트를 찾을 수 없습니다.'); return; }
    setBusyId(game.id);
    try {
      if (savedIds.has(game.id)) {
        await api.removeFromMine(game.id);
        notify('내 리스트에서 뺐어요.');
      } else {
        await api.addToMine(game.id);
        notify('내 리스트에 담았어요.');
      }
      await refreshMine();
    } catch (error) { notify(errorMessage(error)); }
    finally { setBusyId(null); }
  }

  async function pickGame() {
    setPicking(true);
    try {
      const result = page === 'lists' && selectedList
        ? await api.listPick(selectedList.id, filters)
        : await api.pick(filters);
      setPicked(result);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) notify('조건에 맞는 게임이 없어요. 필터를 바꿔보세요.');
      else notify(errorMessage(error));
    } finally { setPicking(false); }
  }

  async function finishAuth(nextMember: Member) {
    setMember(nextMember);
    setAuthMode(null);
    try {
      const nextLists = await api.lists();
      setLists(nextLists);
      const list = nextLists.find(item => item.memberId === nextMember.id);
      await refreshMine(list);
    } catch (error) { notify(errorMessage(error)); }
    notify(`${nextMember.nickname}님, 반가워요!`);
  }

  async function logout() {
    try {
      await api.logout();
      setMember(null);
      setMineGames([]);
      if (page === 'mine' || page === 'admin') navigate('discover');
      notify('로그아웃했습니다.');
    } catch (error) { notify(errorMessage(error)); }
  }

  async function saveGame(input: GameInput) {
    try {
      if (editingGame) await api.updateGame(editingGame.id, input);
      else await api.createGame(input);
      await refreshCatalog();
      setEditorOpen(false);
      setEditingGame(null);
      notify(editingGame ? '게임 정보를 수정했어요.' : '새 게임을 등록했어요.');
    } catch (error) { notify(errorMessage(error)); throw error; }
  }

  async function deleteGame(game: Game) {
    if (!window.confirm(`「${game.name}」 게임을 삭제할까요?`)) return;
    setBusyId(game.id);
    try {
      await api.deleteGame(game.id);
      await refreshCatalog();
      notify('게임을 삭제했어요.');
    } catch (error) { notify(errorMessage(error)); }
    finally { setBusyId(null); }
  }

  function openList(list: GameList) {
    setSelectedList(list);
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPicked(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const showCatalog = page === 'discover' || (page === 'lists' && selectedList);
  return <>
    <div className="site-shell">
      <header className="topbar">
        <button className="brand" onClick={() => navigate('discover')} aria-label="boardPICK 홈">
          <span className="brand-mark"><Dices size={21} strokeWidth={2.4} /></span>
          <span>board<span className="brand-accent">PICK</span><span className="brand-dot">.</span></span>
        </button>
        <nav className={`main-nav ${menuOpen ? 'is-open' : ''}`} aria-label="주요 메뉴">
          <button className={page === 'discover' ? 'active' : ''} onClick={() => navigate('discover')}>게임 탐색</button>
          <button className={page === 'lists' ? 'active' : ''} onClick={() => navigate('lists')}>게임 리스트</button>
          <button className={page === 'mine' ? 'active' : ''} onClick={() => navigate('mine')}>내 컬렉션</button>
          {isAdmin && <button className={page === 'admin' ? 'active' : ''} onClick={() => navigate('admin')}>게임 관리</button>}
        </nav>
        <div className="header-actions">
          {member ? <div className="member-menu"><span className="avatar">{initials(member.nickname)}</span><span className="member-name">{member.nickname}</span><button className="icon-button logout-button" onClick={logout} title="로그아웃" aria-label="로그아웃"><LogOut size={17} /></button></div>
            : <button className="header-login" onClick={() => setAuthMode('login')}>로그인 <ArrowRight size={16} /></button>}
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="메뉴 열기">{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
        </div>
      </header>

      {page === 'discover' && <>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow hero-eyebrow"><span className="eyebrow-line" /> BOARD GAME DISCOVERY CLUB</span>
            <h1>다음 게임은<br /><em>뭘 하지?</em></h1>
            <p>고르는 시간은 줄이고, 함께하는 시간은 늘려요.<br className="desktop-break" /> 오늘의 테이블에 딱 맞는 게임을 찾아보세요.</p>
            <div className="hero-actions">
              <button className="button button-dark" onClick={() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })}>게임 둘러보기 <ArrowDownRight size={19} /></button>
              <button className="button button-ghost" onClick={pickGame}><Shuffle size={17} /> 바로 추천받기</button>
            </div>
            <div className="hero-foot"><div className="hero-stat"><strong>{allGames.length.toString().padStart(2, '0')}</strong><span>등록된 게임</span></div><span className="stat-rule" /><div className="hero-stat"><strong>{visibleLists.length.toString().padStart(2, '0')}</strong><span>볼 수 있는 리스트</span></div></div>
          </div>
          <HeroArt />
        </section>
        <div className="marquee" aria-hidden="true"><span>FIND YOUR NEXT FAVORITE</span><Sparkles size={17} /><span>ROLL THE DICE</span><Sparkles size={17} /><span>MAKE GAME NIGHT HAPPEN</span><Sparkles size={17} /><span>FIND YOUR NEXT FAVORITE</span></div>
      </>}

      {page === 'lists' && !selectedList && <section className="page-intro"><span className="eyebrow">CURATED COLLECTIONS</span><h1>누군가의 취향에서<br /><em>다음 게임을 발견해요.</em></h1><p>다른 플레이어의 리스트를 둘러보고, 마음에 드는 게임을 골라보세요.</p></section>}
      {page === 'mine' && <section className="page-intro mine-intro"><span className="eyebrow">YOUR GAME SHELF</span><h1>{member?.nickname}님의<br /><em>게임 컬렉션.</em></h1><p>내가 담은 게임만 모아보고, 오늘 플레이할 게임을 골라보세요.</p></section>}
      {page === 'admin' && <section className="page-intro admin-intro"><span className="eyebrow">GAME LIBRARY MANAGER</span><h1>게임 라이브러리<br /><em>관리하기.</em></h1><p>새 게임을 등록하고, 기존 정보를 관리할 수 있어요.</p></section>}

      <main>
        {page === 'lists' && !selectedList && <section className="content-section list-overview"><SectionHeading eyebrow="COMMUNITY SHELVES" title="게임 리스트" detail={`${visibleLists.length}개의 리스트`} />
          {visibleLists.length ? <div className="list-grid">{visibleLists.map((list, index) => <button className={`list-tile list-tile-${index % 4}`} key={list.id} onClick={() => openList(list)}><span className="list-tile-top"><Layers3 size={23} /><ArrowRight size={21} /></span><span className="list-tile-body"><span className="list-number">COLLECTION / {String(index + 1).padStart(2, '0')}</span><strong>{list.name}</strong><small>{list.isPublic ? '공개 리스트' : '내 리스트'} · 플레이어 #{list.memberId}</small></span></button>)}</div> : <EmptyState icon={<Layers3 size={29} />} title="지금 볼 수 있는 리스트가 없어요" description="공개 리스트가 등록되면 이곳에서 볼 수 있어요. 가입하면 내 리스트도 만들어집니다." action={!member ? <button className="button button-dark" onClick={() => setAuthMode('signup')}>시작하기 <ArrowRight size={17} /></button> : undefined} />}
        </section>}

        {showCatalog && <section className="content-section catalog-section" id="catalog">
          {selectedList && <button className="back-link" onClick={() => { setSelectedList(null); setPicked(null); }}><ArrowLeft size={17} /> 전체 리스트로 돌아가기</button>}
          <SectionHeading eyebrow={selectedList ? 'INSIDE THIS COLLECTION' : 'EXPLORE THE LIBRARY'} title={selectedList ? selectedList.name : '게임을 찾아볼까요?'} detail={selectedList ? '리스트에서 마음에 드는 게임을 찾아보세요.' : '취향과 상황에 맞게 골라보세요.'} />
          <div className="catalog-layout">
            <aside className="filter-panel">
              <div className="filter-title"><SlidersHorizontal size={18} /><strong>필터</strong><button onClick={() => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); }}>초기화</button></div>
              <label className="field-label" htmlFor="keyword">게임 이름</label>
              <div className="input-with-icon"><Search size={17} /><input id="keyword" placeholder="어떤 게임을 찾으세요?" value={filters.keyword} onChange={event => setFilters({ ...filters, keyword: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') setAppliedFilters({ ...filters }); }} /></div>
              <label className="field-label" htmlFor="players">플레이 인원</label>
              <div className="select-wrap"><select id="players" value={filters.players} onChange={event => setFilters({ ...filters, players: event.target.value })}><option value="">인원 무관</option>{Array.from({ length: 12 }, (_, index) => index + 1).map(number => <option key={number} value={number}>{number}명</option>)}</select><ChevronDown size={16} /></div>
              <label className="field-label" htmlFor="category">카테고리</label>
              <div className="select-wrap"><select id="category" value={filters.category} onChange={event => setFilters({ ...filters, category: event.target.value })}><option value="">모든 카테고리</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select><ChevronDown size={16} /></div>
              <label className="field-label" htmlFor="time">최대 플레이 시간</label>
              <div className="select-wrap"><select id="time" value={filters.maxPlayTime} onChange={event => setFilters({ ...filters, maxPlayTime: event.target.value })}><option value="">시간 무관</option><option value="30">30분 이내</option><option value="60">1시간 이내</option><option value="90">1시간 30분 이내</option><option value="120">2시간 이내</option><option value="180">3시간 이내</option></select><ChevronDown size={16} /></div>
              <button className="button button-dark apply-button" onClick={() => setAppliedFilters({ ...filters })}>결과 보기 <ArrowRight size={17} /></button>
            </aside>
            <div className="results-area">
              <div className="results-bar"><div><span className="eyebrow">THE LINEUP</span><h3>{loading ? '게임을 찾는 중...' : `${games.length}개의 게임`}</h3></div><button className="shuffle-button" disabled={picking} onClick={pickGame}><Shuffle size={18} /> {picking ? '고르는 중...' : '랜덤으로 하나 골라줘'}</button></div>
              {loading ? <div className="game-grid">{[1, 2, 3, 4].map(index => <div className="game-card skeleton" key={index} />)}</div>
                : games.length ? <div className="game-grid">{games.map((game, index) => <GameCard key={game.id} game={game} index={index} saved={savedIds.has(game.id)} busy={busyId === game.id} onSave={() => toggleSaved(game)} />)}</div>
                  : <EmptyState icon={<Dices size={30} />} title={allGames.length ? '조건에 맞는 게임이 없어요' : '아직 등록된 게임이 없어요'} description={allGames.length ? '필터를 조금 바꿔보면 어떨까요?' : '관리자가 게임을 등록하면 이곳에서 만나볼 수 있어요.'} action={allGames.length ? <button className="button button-outline" onClick={() => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); }}>필터 초기화</button> : undefined} />}
            </div>
          </div>
        </section>}

        {page === 'mine' && <section className="content-section mine-section"><SectionHeading eyebrow="SAVED FOR LATER" title="내가 담은 게임" detail={`${mineGames.length}개의 게임`} />
          {mineGames.length ? <><div className="mine-toolbar"><span>내 리스트에서 바로 게임을 고를 수 있어요.</span><button className="shuffle-button" disabled={picking} onClick={async () => { if (!myList) return; setPicking(true); try { setPicked(await api.listPick(myList.id, emptyFilters)); } catch (error) { notify(errorMessage(error)); } finally { setPicking(false); } }}><Shuffle size={17} /> 내 게임에서 추천</button></div><div className="game-grid mine-grid">{mineGames.map((game, index) => <GameCard key={game.id} game={game} index={index} saved busy={busyId === game.id} onSave={() => toggleSaved(game)} />)}</div></>
            : <EmptyState icon={<Heart size={30} />} title="아직 담아둔 게임이 없어요" description="마음에 드는 게임을 발견하면 하트를 눌러 보관해보세요." action={<button className="button button-dark" onClick={() => navigate('discover')}>게임 탐색하기 <ArrowRight size={17} /></button>} />}
        </section>}

        {page === 'admin' && <section className="content-section admin-section"><SectionHeading eyebrow="ALL GAMES" title="등록된 게임" detail={`${allGames.length}개의 게임`} action={<button className="button button-dark" onClick={() => { setEditingGame(null); setEditorOpen(true); }}><Plus size={18} /> 새 게임 등록</button>} />
          {allGames.length ? <div className="admin-table"><div className="admin-row admin-table-head"><span>게임</span><span>카테고리</span><span>인원</span><span>시간</span><span>난이도</span><span>관리</span></div>{allGames.map(game => <div className="admin-row" key={game.id}><div className="admin-game"><span className={`admin-token tone-${colorIndex(game.category)}`}>{initials(game.name)}</span><strong>{game.name}</strong></div><span>{game.category}</span><span>{game.minPlayer}–{game.maxPlayer}명</span><span>{game.playTimeMinutes}분</span><span>{difficultyLabel(game.difficulty)}</span><div className="admin-controls"><button onClick={() => { setEditingGame(game); setEditorOpen(true); }} aria-label={`${game.name} 수정`}><Pencil size={16} /></button><button disabled={busyId === game.id} onClick={() => deleteGame(game)} aria-label={`${game.name} 삭제`}><Trash2 size={16} /></button></div></div>)}</div>
            : <EmptyState icon={<Layers3 size={30} />} title="첫 게임을 등록해보세요" description="게임 정보를 추가하면 탐색 화면에 바로 나타납니다." action={<button className="button button-dark" onClick={() => { setEditingGame(null); setEditorOpen(true); }}><Plus size={18} /> 게임 등록</button>} />}
        </section>}
      </main>

      <section className="footer-cta"><div><span className="eyebrow">GOOD GAMES, GOOD COMPANY</span><h2>좋은 게임은<br /><em>함께할 때 더 즐거우니까.</em></h2></div><span className="footer-illustration" aria-hidden="true">✳</span></section>
      <footer className="footer"><div className="footer-brand"><span className="brand-mark"><Dices size={17} /></span><strong>boardPICK.</strong></div><span>고르는 순간부터 즐거운 게임 나이트.</span><small>© {new Date().getFullYear()} boardPICK</small></footer>
    </div>

    {picked && <Modal onClose={() => setPicked(null)}><div className="pick-modal"><span className="eyebrow"><Sparkles size={15} /> TONIGHT'S PICK</span><div className={`pick-art tone-${colorIndex(picked.category)}`}><span className="pick-art-orbit" /><strong>{initials(picked.name)}</strong><Dices size={36} /></div><p>오늘의 게임은 바로</p><h2>{picked.name}</h2><div className="pick-meta"><span><UsersRound size={16} /> {picked.minPlayer}–{picked.maxPlayer}명</span><span><Clock3 size={16} /> {picked.playTimeMinutes}분</span><span><Layers3 size={16} /> {picked.category}</span></div><div className="pick-actions"><button className="button button-outline" onClick={pickGame} disabled={picking}><Shuffle size={17} /> 다시 뽑기</button><button className="button button-dark" onClick={() => toggleSaved(picked)}><Heart size={17} fill={savedIds.has(picked.id) ? 'currentColor' : 'none'} /> {savedIds.has(picked.id) ? '담아둔 게임' : '내 리스트에 담기'}</button></div></div></Modal>}
    {authMode && <AuthDialog mode={authMode} setMode={setAuthMode} onClose={() => setAuthMode(null)} onSuccess={finishAuth} />}
    {editorOpen && <GameEditor game={editingGame} onClose={() => setEditorOpen(false)} onSave={saveGame} />}
    {toast && <div className="toast" role="status"><Check size={17} /> {toast}<button onClick={() => setToast('')} aria-label="알림 닫기"><X size={15} /></button></div>}
  </>;
}

function HeroArt() {
  return <div className="hero-art" aria-hidden="true"><div className="hero-art-grid" /><span className="art-caption">THE ART OF<br />CHOOSING FUN</span><div className="art-card art-card-back"><span>PLAY<br />MORE</span><div className="art-star">✳</div></div><div className="art-card art-card-front"><div className="art-card-top"><span>BOARD<br />PICK</span><span>01 / 25</span></div><div className="art-dice"><span>● <b>●</b></span><span>● <b>●</b></span></div><div className="art-card-bottom">LET'S PLAY <ArrowRight size={22} /></div></div><div className="art-disc">YOUR<br />NEXT<br />MOVE <ArrowDownRight size={25} /></div><span className="art-squiggle">〰</span></div>;
}

function SectionHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{detail}</p></div>{action}</div>;
}

function GameCard({ game, index, saved, busy, onSave }: { game: Game; index: number; saved: boolean; busy: boolean; onSave: () => void }) {
  return <article className="game-card"><div className={`game-art tone-${colorIndex(game.category)}`}><span className="card-index">NO. {String(index + 1).padStart(2, '0')}</span><span className="game-art-ring" /><span className="game-art-letters">{initials(game.name)}</span><span className="game-art-symbol">✳</span><button className={`save-button ${saved ? 'saved' : ''}`} disabled={busy} onClick={onSave} aria-label={saved ? `${game.name} 내 리스트에서 제거` : `${game.name} 내 리스트에 추가`}><Heart size={18} fill={saved ? 'currentColor' : 'none'} /></button></div><div className="game-card-body"><span className="category-label">{game.category}</span><h3>{game.name}</h3><div className="game-card-meta"><span><UsersRound size={15} /> {game.minPlayer}–{game.maxPlayer}명</span><span><Clock3 size={15} /> {game.playTimeMinutes}분</span></div><div className="card-bottom"><span>난이도 <strong>{difficultyLabel(game.difficulty)}</strong></span><span className="card-arrow"><ArrowRight size={18} /></span></div></div></article>;
}

function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = ''; };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-panel" role="dialog" aria-modal="true"><button className="modal-close" onClick={onClose} aria-label="닫기"><X size={20} /></button>{children}</div></div>;
}

function AuthDialog({ mode, setMode, onClose, onSuccess }: { mode: AuthMode; setMode: (mode: AuthMode) => void; onClose: () => void; onSuccess: (member: Member) => Promise<void> }) {
  const [loginId, setLoginId] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setWorking(true);
    try {
      const result = mode === 'login'
        ? await api.login(loginId.trim(), password)
        : await (async () => { await api.signup(loginId.trim(), nickname.trim(), password); return api.login(loginId.trim(), password); })();
      await onSuccess(result);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setWorking(false); }
  }

  return <Modal onClose={onClose}><div className="auth-dialog"><span className="eyebrow">WELCOME TO THE TABLE</span><h2>{mode === 'login' ? <>다시 만나서<br /><em>반가워요.</em></> : <>함께 놀 준비,<br /><em>되셨나요?</em></>}</h2><p>{mode === 'login' ? '로그인하고 나만의 게임 리스트를 이어가세요.' : '계정을 만들고 마음에 드는 게임을 모아보세요.'}</p><form onSubmit={submit}><label>아이디<input autoFocus required minLength={mode === 'signup' ? 3 : undefined} maxLength={20} value={loginId} onChange={event => setLoginId(event.target.value)} placeholder="아이디를 입력하세요" /></label>{mode === 'signup' && <label>닉네임<input required maxLength={30} value={nickname} onChange={event => setNickname(event.target.value)} placeholder="어떻게 불러드릴까요?" /></label>}<label>비밀번호<input type="password" required minLength={mode === 'signup' ? 8 : undefined} value={password} onChange={event => setPassword(event.target.value)} placeholder="비밀번호를 입력하세요" /></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="button button-dark auth-submit" disabled={working} type="submit">{working ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'} <ArrowRight size={18} /></button></form><div className="auth-divider">또는</div><a className="google-button" href="/api/oauth2/google"><span className="google-g">G</span> Google로 계속하기</a><div className="auth-switch">{mode === 'login' ? '아직 계정이 없으신가요?' : '이미 계정이 있으신가요?'} <button onClick={() => { setError(''); setMode(mode === 'login' ? 'signup' : 'login'); }}>{mode === 'login' ? '회원가입' : '로그인'}</button></div></div></Modal>;
}

function GameEditor({ game, onClose, onSave }: { game: Game | null; onClose: () => void; onSave: (input: GameInput) => Promise<void> }) {
  const [input, setInput] = useState<GameInput>(game ? { name: game.name, minPlayer: game.minPlayer, maxPlayer: game.maxPlayer, category: game.category, playTimeMinutes: game.playTimeMinutes, difficulty: game.difficulty } : emptyGame);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  function update<K extends keyof GameInput>(key: K, value: GameInput[K]) { setInput(current => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (input.minPlayer > input.maxPlayer) { setError('최소 인원은 최대 인원보다 클 수 없습니다.'); return; }
    setError(''); setWorking(true);
    try { await onSave({ ...input, name: input.name.trim(), category: input.category.trim() }); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setWorking(false); }
  }
  return <Modal onClose={onClose}><div className="editor-dialog"><span className="eyebrow">GAME LIBRARY</span><h2>{game ? '게임 정보 수정' : '새 게임 등록'}</h2><p>플레이어들이 더 좋은 게임을 발견할 수 있도록 정보를 채워주세요.</p><form onSubmit={submit}><label>게임 이름<input required maxLength={255} value={input.name} onChange={event => update('name', event.target.value)} placeholder="예: 스플렌더" /></label><label>카테고리<input required maxLength={255} value={input.category} onChange={event => update('category', event.target.value)} placeholder="예: 전략" /></label><div className="form-columns"><label>최소 인원<input required type="number" min="1" value={input.minPlayer} onChange={event => update('minPlayer', Number(event.target.value))} /></label><label>최대 인원<input required type="number" min="1" value={input.maxPlayer} onChange={event => update('maxPlayer', Number(event.target.value))} /></label></div><div className="form-columns"><label>플레이 시간 (분)<input required type="number" min="1" value={input.playTimeMinutes} onChange={event => update('playTimeMinutes', Number(event.target.value))} /></label><label>난이도<select value={input.difficulty} onChange={event => update('difficulty', Number(event.target.value))}>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} · {difficultyLabel(value)}</option>)}</select></label></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="editor-actions"><button type="button" className="button button-outline" onClick={onClose}>취소</button><button type="submit" className="button button-dark" disabled={working}>{working ? '저장 중...' : game ? '수정 저장' : '게임 등록'} <ArrowRight size={17} /></button></div></form></div></Modal>;
}

export default App;
