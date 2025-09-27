
import React, { useState, useEffect, useContext, createContext, useCallback, useMemo } from 'react';
import { HashRouter, Routes, Route, Link, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import type { Spot, Session, Device, Summary, FirebaseConfig, User, ViewMode, Theme, FeeSettings } from './types';
import { HomeIcon, CarIcon, HistoryIcon, ChartIcon, SearchIcon, SettingsIcon, ServerIcon, SunIcon, MoonIcon, MonitorIcon, SmartphoneIcon, LogInIcon, LogOutIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon, LockIcon, RefreshIcon, SlidersIcon, TrashIcon, DownloadIcon, MenuIcon } from './components/Icons';


// --- HELPERS ---
const getFeeSettings = (): FeeSettings => {
    try {
        const savedSettings = localStorage.getItem('feeSettings');
        if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            return {
                feeMethod: parsed.feeMethod || 'hourly',
                hourlyRate: parsed.hourlyRate || 5000,
                freeMinutes: parsed.freeMinutes || 15,
                dailyRate: parsed.dailyRate || 30000,
            };
        }
    } catch (e) {
        console.error("Could not parse fee settings", e);
    }
    return { feeMethod: 'hourly', hourlyRate: 5000, freeMinutes: 15, dailyRate: 30000 };
};

const calculateFee = (inAt: number, outAt: number, settings: FeeSettings): { fee: number, feeType: 'hourly' | 'daily' } => {
    const durationMs = outAt - inAt;
    const durationMinutes = durationMs / 60000;

    if (settings.feeMethod === 'daily') {
        const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
        return { fee: durationDays * settings.dailyRate, feeType: 'daily' };
    }

    // Hourly
    if (durationMinutes <= settings.freeMinutes) {
        return { fee: 0, feeType: 'hourly' };
    }
    const chargeableHours = Math.ceil(durationMinutes / 60);
    return { fee: chargeableHours * settings.hourlyRate, feeType: 'hourly' };
}

// --- MOCK DATA ---
const generateMockData = () => {
    const now = Date.now();
    const feeSettings = getFeeSettings();
    const spots: Spot[] = Array.from({ length: 6 }, (_, i) => ({
        id: `S-0${i + 1}`,
        label: `S-0${i + 1}`,
        occupied: i < 3,
        currentSessionId: i < 3 ? `sid-open-${i + 1}` : null,
        lastChange: now - Math.random() * 3600 * 1000,
    }));

    const openSessions: Session[] = [
        { id: 'sid-open-1', lotId: 'lot-1', spotId: 'S-01', rfid: 'RFID001', plate: '65F-123.45', plateLower: '65f12345', inAt: now - 15 * 60 * 1000, outAt: null, fee: null, imagePathIn: 'https://picsum.photos/id/10/200/150', imagePathOut: null, status: 'open' },
        { id: 'sid-open-2', lotId: 'lot-1', spotId: 'S-02', rfid: 'RFID002', plate: '30H-456.78', plateLower: '30h45678', inAt: now - 5 * 60 * 1000, outAt: null, fee: null, imagePathIn: 'https://picsum.photos/id/20/200/150', imagePathOut: null, status: 'open' },
        { id: 'sid-open-3', lotId: 'lot-1', spotId: 'S-03', rfid: 'RFID003', plate: '30H-456.90', plateLower: '30h45690', inAt: now - 65 * 60 * 1000, outAt: null, fee: null, imagePathIn: 'https://picsum.photos/id/30/200/150', imagePathOut: null, status: 'open' },
    ];
    
    const closedSessions: Session[] = [];
    for (let i = 0; i < 50; i++) {
        const dayAgo = Math.floor(Math.random() * 7); // 0-6 days ago
        const hourIn = Math.floor(Math.random() * 24);
        const minuteIn = Math.floor(Math.random() * 60);
        const durationMinutes = Math.floor(Math.random() * 300) + 30; // 30min to 5.5 hours

        const inAt = new Date();
        inAt.setDate(inAt.getDate() - dayAgo);
        inAt.setHours(hourIn, minuteIn, 0, 0);
        const inAtTimestamp = inAt.getTime();
        
        if (inAtTimestamp > now) continue;

        const outAtTimestamp = inAtTimestamp + durationMinutes * 60 * 1000;
        if (outAtTimestamp > now) continue;

        const { fee, feeType } = calculateFee(inAtTimestamp, outAtTimestamp, feeSettings);

        closedSessions.push({
            id: `sid-closed-${i + 1}`,
            lotId: 'lot-1',
            spotId: `S-0${(i % 6) + 1}`,
            rfid: `RFIDCLOSED${i}`,
            plate: `29A-${Math.floor(100 + Math.random() * 900)}.${Math.floor(10 + Math.random() * 90)}`,
            plateLower: `29a${Math.floor(100 + Math.random() * 900)}${Math.floor(10 + Math.random() * 90)}`,
            inAt: inAtTimestamp,
            outAt: outAtTimestamp,
            fee,
            imagePathIn: `https://picsum.photos/id/${30+i}/200/150`,
            imagePathOut: `https://picsum.photos/id/${80+i}/200/150`,
            status: 'closed',
            feeType,
        });
    }

    const devices: Device[] = [
        { id: 'ESP32-CAM-01', lastSeen: now - 5 * 1000, status: 'OK' },
        { id: 'ESP32-GATE-01', lastSeen: now - 120 * 1000, status: 'WARN' },
    ];
    
    const summary: Summary = {
        occupied: spots.filter(s => s.occupied).length,
        total: spots.length,
        occupancyPercent: (spots.filter(s => s.occupied).length / spots.length) * 100,
    };

    return { spots, sessions: [...openSessions, ...closedSessions], devices, summary };
};


// --- CONTEXTS ---
interface UIContextType {
    viewMode: ViewMode;
    theme: Theme;
    toggleViewMode: () => void;
    toggleTheme: () => void;
    isMobileMenuOpen: boolean;
    toggleMobileMenu: () => void;
}
const UIContext = createContext<UIContextType | null>(null);

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (email: string, pass: string) => Promise<void>;
    loginWithPassword: (pass: string) => Promise<void>;
    logout: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType | null>(null);

// In a real app, firebase services would be imported. Here we'll mock them.
type MockData = {
    spots: Spot[];
    sessions: Session[];
    devices: Device[];
    summary: Summary;
}
interface FirebaseContextType {
    isConfigured: boolean;
    config: FirebaseConfig | null;
    setConfig: (config: FirebaseConfig | null, save: boolean) => void;
    data: MockData;
    loading: boolean;
    error: string | null;
    testConnection: () => Promise<{ firebase: boolean; device: boolean; web: boolean }>;
    updateMockData: (updates: Partial<MockData>) => void;
    resetMockData: () => void;
}
const FirebaseContext = createContext<FirebaseContextType | null>(null);

// --- HOOKS ---
const useUI = () => useContext(UIContext)!;
const useAuth = () => useContext(AuthContext)!;
const useFirebase = () => useContext(FirebaseContext)!;


// --- PROVIDERS ---
const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [viewMode, setViewMode] = useState<ViewMode>(() => window.innerWidth < 768 ? 'mobile' : 'web');
    const [theme, setTheme] = useState<Theme>('dark');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        const storedTheme = localStorage.getItem('theme') as Theme;
        if (storedTheme) {
            setTheme(storedTheme);
        } else {
            setTheme('dark'); // Default to dark
        }
    }, []);

    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleViewMode = () => setViewMode(prev => prev === 'mobile' ? 'web' : 'mobile');
    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
    const toggleMobileMenu = () => setIsMobileMenuOpen(prev => !prev);

    return (
        <UIContext.Provider value={{ viewMode, theme, toggleViewMode, toggleTheme, isMobileMenuOpen, toggleMobileMenu }}>
            {children}
        </UIContext.Provider>
    );
};

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Mock auth state persistence
        setTimeout(() => {
             const storedUser = localStorage.getItem('mockUser');
             if(storedUser) {
                 setUser(JSON.parse(storedUser));
             }
             setLoading(false);
        }, 500);
    }, []);

    const login = async (email: string, pass: string) => {
        if (email === 'admin@example.com' && pass === 'password') {
            const mockUser: User = { email, uid: 'mock-admin-uid', isAdmin: true, name: 'ADMIN' };
            setUser(mockUser);
            localStorage.setItem('mockUser', JSON.stringify(mockUser));
        } else {
            throw new Error('Email hoặc mật khẩu không đúng.');
        }
    };

    const loginWithPassword = async (pass: string) => {
        let mockUser: User | null = null;
        if (pass === '003979') {
            mockUser = { email: null, uid: 'mock-admin-uid-dash', isAdmin: true, name: 'ADMIN' };
        } else if (pass === '678910') {
            mockUser = { email: null, uid: 'mock-boss-uid-dash', isAdmin: true, name: 'BOSS' };
        }
    
        if (mockUser) {
            setUser(mockUser);
            localStorage.setItem('mockUser', JSON.stringify(mockUser));
        } else {
            throw new Error('Mật khẩu không đúng.');
        }
    };

    const logout = async () => {
        setUser(null);
        localStorage.removeItem('mockUser');
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, loginWithPassword, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [config, setConfigState] = useState<FirebaseConfig | null>(null);
    const [originalData, setOriginalData] = useState(() => generateMockData());
    const [data, setData] = useState<MockData>(originalData);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const storedConfig = localStorage.getItem('firebaseConfig');
        if (storedConfig) {
            setConfigState(JSON.parse(storedConfig));
        }
    }, []);

    const setConfig = (newConfig: FirebaseConfig | null, save: boolean) => {
        setConfigState(newConfig);
        if (save && newConfig) {
            localStorage.setItem('firebaseConfig', JSON.stringify(newConfig));
        }
        if (!newConfig) {
          localStorage.removeItem('firebaseConfig');
        }
    };
    
    useEffect(() => {
        if(!config) {
            const newData = generateMockData();
            setOriginalData(newData);
            setData(newData);
        }
    }, [config]);

    const testConnection = async () => {
        if (!config) return { firebase: false, device: false, web: true };
        await new Promise(res => setTimeout(res, 1000));
        const success = Object.values(config).every(val => val && val.length > 5);
        return { firebase: success, device: success, web: true };
    };
    
    const updateMockData = useCallback((updates: Partial<MockData>) => {
        setData(prevData => {
            const newData = { ...prevData, ...updates };
            if (updates.spots || updates.sessions) {
                 const currentSpots = updates.spots || prevData.spots;
                 const newOccupied = currentSpots.filter(s => s.occupied).length;
                 const newTotal = currentSpots.length;
                 newData.summary = {
                     occupied: newOccupied,
                     total: newTotal,
                     occupancyPercent: newTotal > 0 ? (newOccupied / newTotal) * 100 : 0,
                 };
            }
            return newData;
        });
    }, []);

    const resetMockData = useCallback(() => {
        setData(originalData);
    }, [originalData]);


    return (
        <FirebaseContext.Provider value={{ isConfigured: !!config, config, setConfig, data, loading, error, testConnection, updateMockData, resetMockData }}>
            {children}
        </FirebaseContext.Provider>
    );
};

// --- UI COMPONENTS ---
const Card: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className }) => (
    <div className={`bg-white dark:bg-dark-card shadow-md rounded-lg p-4 ${className}`}>
        {children}
    </div>
);

const Button: React.FC<{ children: React.ReactNode, onClick?: () => void, className?: string, variant?: 'primary' | 'danger' | 'success' | 'warning' | 'ghost', type?: 'button' | 'submit', disabled?: boolean }> = ({ children, onClick, className, variant = 'primary', type = 'button', disabled = false }) => {
    const baseClasses = 'px-4 py-2 rounded-md font-semibold text-white flex items-center justify-center gap-2 transition-transform transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
    const variantClasses = {
        primary: 'bg-primary hover:bg-blue-700',
        danger: 'bg-danger hover:bg-red-700',
        success: 'bg-success hover:bg-green-700',
        warning: 'bg-warning hover:bg-amber-600 text-black',
        ghost: 'bg-transparent text-gray-700 dark:text-dark-text hover:bg-gray-200 dark:hover:bg-zinc-700',
    };
    return <button type={type} onClick={onClick} className={`${baseClasses} ${variantClasses[variant]} ${className}`} disabled={disabled}>{children}</button>;
};

const Modal: React.FC<{ isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center" onClick={onClose}>
            <div className="bg-white dark:bg-dark-card rounded-lg shadow-xl p-6 w-11/12 max-w-md" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-dark-text">{title}</h3>
                    <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white">&times;</button>
                </div>
                <div>{children}</div>
            </div>
        </div>
    );
};

// --- LAYOUT COMPONENTS ---
const NAV_ITEMS = [
    { path: '/', label: 'Trang chủ', icon: HomeIcon, admin: false, demoAdminOnly: false },
    { path: '/realtime', label: 'Trong bãi', icon: CarIcon, admin: false, demoAdminOnly: false },
    { path: '/history', label: 'Lịch sử', icon: HistoryIcon, admin: false, demoAdminOnly: false },
    { path: '/charts', label: 'Biểu đồ', icon: ChartIcon, admin: false, demoAdminOnly: false },
    { path: '/search', label: 'Tìm kiếm', icon: SearchIcon, admin: false, demoAdminOnly: false },
    { path: '/settings', label: 'Cài đặt', icon: SettingsIcon, admin: true, demoAdminOnly: false },
    { path: '/demo', label: 'Demo', icon: SlidersIcon, admin: true, demoAdminOnly: true },
    { path: '/connect', label: 'Kết nối', icon: ServerIcon, admin: false, demoAdminOnly: false },
];

const TopHeader: React.FC = () => {
    const { theme, toggleTheme, viewMode, toggleViewMode, toggleMobileMenu } = useUI();
    const { user, logout } = useAuth();
    return (
        <header className="bg-white dark:bg-dark-card shadow-md p-2 flex justify-between items-center flex-shrink-0 z-30">
            <h1 className="text-lg font-bold text-primary px-4 hidden md:block">Hệ Thống Quản Lý Bãi Đỗ Xe Thông Minh</h1>
            <h1 className="text-lg font-bold text-primary px-2 md:hidden">Bãi Xe T.Minh</h1>
            <div className="flex items-center gap-1">
                 <span className="text-sm hidden sm:flex items-center gap-1 text-gray-600 dark:text-gray-400"><MonitorIcon className="w-4 h-4" /> Device</span>
                 <button className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700"><RefreshIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" /></button>
                <button onClick={toggleViewMode} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700">
                    {viewMode === 'web' ? <SmartphoneIcon className="w-5 h-5 text-gray-600 dark:text-gray-300"/> : <MonitorIcon className="w-5 h-5 text-gray-600 dark:text-gray-300"/>}
                </button>
                <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700">
                    {theme === 'light' ? <MoonIcon className="w-5 h-5 text-gray-600 dark:text-gray-300"/> : <SunIcon className="w-5 h-5 text-gray-300"/>}
                </button>
                {user && (
                    <button onClick={logout} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700">
                        <LogOutIcon className="w-5 h-5 text-danger"/>
                    </button>
                )}
                 {viewMode === 'mobile' && (
                    <button onClick={toggleMobileMenu} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700 md:hidden">
                        <MenuIcon className="w-6 h-6 text-gray-600 dark:text-gray-300"/>
                    </button>
                )}
            </div>
        </header>
    );
};

const ContentHeader: React.FC = () => {
    const location = useLocation();
    const currentRoute = NAV_ITEMS.find(item => item.path === location.pathname);
    return (
      <div className="bg-white dark:bg-dark-card p-4 flex-shrink-0 border-b border-gray-200 dark:border-zinc-700">
        <h2 className="text-xl font-bold text-gray-800 dark:text-dark-text">
            Bãi Xe Thông Minh {currentRoute && `- ${currentRoute.label}`}
        </h2>
      </div>
    );
}

const NavItem: React.FC<{ item: typeof NAV_ITEMS[0], isWebView: boolean }> = ({ item, isWebView }) => {
    const navLinkClasses = `flex transition-colors duration-200 rounded-md`;
    const activeClass = 'bg-blue-600 text-white dark:bg-blue-500';
    const inactiveClass = 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700';

    const mobileClasses = 'flex-col items-center justify-center p-1 text-xs gap-1 flex-1';
    const webClasses = 'items-center p-2.5 text-sm gap-4';

    return (
        <NavLink
            to={item.path}
            className={({ isActive }) =>
                `${navLinkClasses} ${isWebView ? webClasses : mobileClasses} ${isActive ? activeClass : inactiveClass}`
            }
        >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
        </NavLink>
    );
};

const Sidebar: React.FC = () => {
    const { user } = useAuth();
    const visibleItems = NAV_ITEMS.filter(item => {
        if (item.demoAdminOnly) return user?.uid === 'mock-admin-uid-dash';
        return !item.admin || (item.admin && user?.isAdmin);
    });

    return (
        <aside className="w-60 bg-white dark:bg-dark-card p-4 flex-col gap-2 flex-shrink-0 hidden md:flex">
            <div className="text-2xl font-bold text-blue-500 mb-6 px-2">Menu</div>
            <nav className="flex flex-col gap-2">
                {visibleItems.map(item => <NavItem key={item.path} item={item} isWebView={true} />)}
            </nav>
        </aside>
    );
};

const MobileSidebar: React.FC = () => {
    const { user } = useAuth();
    const { isMobileMenuOpen, toggleMobileMenu } = useUI();
    
    const visibleItems = NAV_ITEMS.filter(item => {
        if (item.demoAdminOnly) return user?.uid === 'mock-admin-uid-dash';
        return !item.admin || (item.admin && user?.isAdmin);
    });

    const sidebarClasses = isMobileMenuOpen
        ? 'translate-x-0'
        : 'translate-x-full';

    return (
        <>
            {isMobileMenuOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden" onClick={toggleMobileMenu}></div>}
            <aside className={`fixed top-0 right-0 h-full w-64 bg-white dark:bg-dark-card p-4 flex flex-col gap-2 z-50 transform transition-transform duration-300 ease-in-out md:hidden ${sidebarClasses}`}>
                <div className="text-2xl font-bold text-blue-500 mb-6 px-2">Menu</div>
                <nav className="flex flex-col gap-2">
                    {visibleItems.map(item => (
                        <div key={item.path} onClick={toggleMobileMenu}>
                           <NavItem item={item} isWebView={true} />
                        </div>
                    ))}
                </nav>
            </aside>
        </>
    );
};

const WebLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
     <div className="flex flex-col h-screen bg-gray-100 dark:bg-dark-bg text-gray-800 dark:text-dark-text">
        <TopHeader /> 
        <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <ContentHeader /> 
                <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    </div>
);

const MobileLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-dark-bg text-gray-800 dark:text-dark-text overflow-hidden">
        <TopHeader />
        <main className="p-4 flex-1 overflow-y-auto">
            {children}
        </main>
        <MobileSidebar />
    </div>
);


const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <div className="flex justify-center items-center h-screen">Đang tải...</div>;
    }

    if (!user?.isAdmin) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <>{children}</>;
};

const DemoProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <div className="flex justify-center items-center h-screen">Đang tải...</div>;
    }

    if (user?.uid !== 'mock-admin-uid-dash') {
        return <Navigate to="/" state={{ from: location }} replace />;
    }

    return <>{children}</>;
};


// --- PAGES ---

const DashboardPage: React.FC = () => {
    const { data } = useFirebase();
    const { user, loginWithPassword, logout } = useAuth();
    const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await loginWithPassword(password);
            setPassword('');
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('An unknown error occurred.');
            }
        }
    };

    const getSessionForSpot = (spot: Spot) => {
        if (!spot.occupied || !spot.currentSessionId) return null;
        return data.sessions.find(s => s.id === spot.currentSessionId);
    };

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold">Bảng điều khiển</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="flex flex-col items-center justify-center">
                    <div className="text-5xl font-bold">{data.summary.occupied} <span className="text-2xl text-gray-500">/ {data.summary.total}</span></div>
                    <div className="text-gray-600 dark:text-gray-400">Đang chiếm / Tổng số</div>
                </Card>
                <Card className="flex flex-col items-center justify-center">
                    <div className="text-5xl font-bold">{data.summary.occupancyPercent.toFixed(0)}%</div>
                    <div className="text-gray-600 dark:text-gray-400">Tỉ lệ lấp đầy</div>
                </Card>
                {user?.isAdmin ? (
                    <Card className="bg-green-100 dark:bg-green-900/50 flex flex-col items-center justify-center p-4 space-y-2">
                        <CheckCircleIcon className="w-10 h-10 text-success"/>
                        <div className="text-xl font-bold text-green-700 dark:text-green-300">
                            Xin chào, {user.name || user.email}!
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                            Bạn đã đăng nhập với quyền Admin.
                        </div>
                        <Button onClick={logout} variant="ghost" className="text-danger">
                            <LogOutIcon className="w-4 h-4" />
                            <span>Đăng xuất</span>
                        </Button>
                    </Card>
                ) : (
                    <Card className="flex flex-col justify-center p-4">
                        <h3 className="text-lg font-bold mb-2 text-center">Đăng nhập Admin</h3>
                        <form onSubmit={handleLogin} className="w-full space-y-2">
                            <input 
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Mật khẩu"
                                className="w-full p-2 border rounded-md dark:bg-zinc-700 dark:border-zinc-600"
                            />
                            {error && <p className="text-xs text-danger text-center">{error}</p>}
                            <Button type="submit" className="w-full">
                                <LogInIcon className="w-4 h-4"/>
                                <span>Đăng nhập</span>
                            </Button>
                        </form>
                    </Card>
                )}
            </div>
            
            <h3 className="text-xl font-bold pt-4">Sơ đồ bãi xe</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {data.spots.map(spot => (
                    <div
                        key={spot.id}
                        onClick={() => setSelectedSpot(spot)}
                        className={`p-4 rounded-lg text-center cursor-pointer transition-all ${
                            spot.occupied
                                ? 'bg-danger/80 text-white'
                                : 'bg-success/80 text-white'
                        }`}
                    >
                        <div className="font-bold text-2xl">{spot.label}</div>
                        <div className="text-sm">{spot.occupied ? getSessionForSpot(spot)?.plate || 'ĐÃ CHIẾM' : 'TRỐNG'}</div>
                    </div>
                ))}
            </div>

            {selectedSpot && (
                <Modal isOpen={!!selectedSpot} onClose={() => setSelectedSpot(null)} title={`Chi tiết vị trí ${selectedSpot.label}`}>
                    {selectedSpot.occupied ? (
                        <div className="space-y-2 text-gray-700 dark:text-gray-300">
                           <p><strong>Trạng thái:</strong> <span className="text-danger font-semibold">Đã chiếm</span></p>
                           <p><strong>Biển số:</strong> {getSessionForSpot(selectedSpot)?.plate}</p>
                           <p><strong>Thời gian vào:</strong> {new Date(getSessionForSpot(selectedSpot)?.inAt || 0).toLocaleString('vi-VN')}</p>
                           {getSessionForSpot(selectedSpot)?.imagePathIn && (
                               <img src={getSessionForSpot(selectedSpot)?.imagePathIn} alt="Ảnh xe vào" className="rounded-lg mt-2 w-full"/>
                           )}
                        </div>
                    ) : (
                        <div className="space-y-2 text-gray-700 dark:text-gray-300">
                           <p><strong>Trạng thái:</strong> <span className="text-success font-semibold">Trống</span></p>
                           <p>Vị trí này hiện đang trống.</p>
                        </div>
                    )}
                </Modal>
            )}
        </div>
    );
};

const RealtimePage: React.FC = () => {
    const { data } = useFirebase();
    const openSessions = useMemo(() => data.sessions.filter(s => s.status === 'open').sort((a,b) => b.inAt - a.inAt), [data.sessions]);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Xe trong bãi</h2>
                <div className="text-lg font-semibold bg-blue-100 dark:bg-blue-900/50 text-primary px-3 py-1 rounded-full">
                    Số xe đang đỗ: {openSessions.length}
                </div>
            </div>
            <div className="space-y-3">
                {openSessions.length > 0 ? openSessions.map(session => (
                    <Card key={session.id} className="flex items-center gap-4">
                        {session.imagePathIn && <img src={session.imagePathIn} alt={`Xe ${session.plate}`} className="w-24 h-20 object-cover rounded-md"/>}
                        <div className="flex-1">
                            <p className="font-bold text-xl">{session.plate}</p>
                            <p className="text-gray-600 dark:text-gray-400">Vị trí: <span className="font-semibold">{session.spotId}</span></p>
                            <p className="text-sm text-gray-500">Vào lúc: {new Date(session.inAt).toLocaleString('vi-VN')}</p>
                        </div>
                    </Card>
                )) : (
                    <Card>
                        <p className="text-center text-gray-500">Không có xe nào trong bãi.</p>
                    </Card>
                )}
            </div>
        </div>
    );
};

const HistoryPage: React.FC = () => {
    const { data } = useFirebase();
    const { user } = useAuth();
    const closedSessions = useMemo(() => data.sessions.filter(s => s.status === 'closed').sort((a, b) => (b.outAt || 0) - (a.outAt || 0)), [data.sessions]);

    const handleExport = () => {
        const headers = ["Biển số", "Vị trí", "Thời gian vào", "Thời gian ra", "Phí"];
        const rows = closedSessions.map(s => [
            s.plate,
            s.spotId,
            `"${new Date(s.inAt).toLocaleString('vi-VN')}"`,
            s.outAt ? `"${new Date(s.outAt).toLocaleString('vi-VN')}"` : 'N/A',
            s.fee?.toLocaleString('vi-VN')
        ].join(","));
        
        let csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n" 
            + rows.join("\n");
            
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "lich_su_gui_xe.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Lịch sử gửi xe</h2>
                {user?.isAdmin && <Button variant="success" onClick={handleExport}><DownloadIcon className="w-5 h-5"/> Xuất CSV</Button>}
            </div>
             <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                    <thead className="text-xs text-gray-200 uppercase bg-gray-700 dark:bg-zinc-800 dark:text-gray-300">
                        <tr>
                            <th scope="col" className="px-6 py-3">Biển số</th>
                            <th scope="col" className="px-6 py-3">Vị trí</th>
                            <th scope="col" className="px-6 py-3">Thời gian vào</th>
                            <th scope="col" className="px-6 py-3">Thời gian ra</th>
                            {user?.isAdmin && <th scope="col" className="px-6 py-3">Phí</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {closedSessions.map(s => (
                            <tr key={s.id} className="bg-white border-b dark:bg-dark-card dark:border-zinc-700">
                                <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">{s.plate}</td>
                                <td className="px-6 py-4">{s.spotId}</td>
                                <td className="px-6 py-4">{new Date(s.inAt).toLocaleString('vi-VN')}</td>
                                <td className="px-6 py-4">{s.outAt ? new Date(s.outAt).toLocaleString('vi-VN') : 'N/A'}</td>
                                {user?.isAdmin && <td className="px-6 py-4">{s.fee?.toLocaleString('vi-VN')}đ</td>}
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>
        </div>
    );
};

const ChartsPage: React.FC = () => {
    const { data } = useFirebase();
    // @ts-ignore
    const Recharts = window.Recharts;

    const { summaryData, dailyRevenue, hourlyTraffic, occupancyData } = useMemo(() => {
        const closedSessions = data.sessions.filter(s => s.status === 'closed' && s.outAt);
        const todayStr = new Date().toDateString();

        const totalCarsToday = data.sessions.filter(s => new Date(s.inAt).toDateString() === todayStr).length;
        const totalRevenueToday = closedSessions
            .filter(s => new Date(s.outAt!).toDateString() === todayStr)
            .reduce((sum, s) => sum + (s.fee || 0), 0);
        
        const totalDuration = closedSessions.reduce((sum, s) => sum + (s.outAt! - s.inAt), 0);
        const avgMs = closedSessions.length > 0 ? totalDuration / closedSessions.length : 0;
        const avgHours = Math.floor(avgMs / 3600000);
        const avgMinutes = Math.floor((avgMs % 3600000) / 60000);
        const avgParkingTime = `${avgHours} giờ ${avgMinutes} phút`;

        const availableSpots = data.summary.total - data.summary.occupied;

        const dailyRevenueMap: { [key: string]: number } = {};
        closedSessions.forEach(s => {
            const date = new Date(s.outAt!).toLocaleDateString('vi-VN', {day: '2-digit'}); // Just day for simplicity
            if (!dailyRevenueMap[date]) dailyRevenueMap[date] = 0;
            dailyRevenueMap[date] += s.fee!;
        });
        const dailyRevenue = Object.entries(dailyRevenueMap)
            .map(([name, Doanh_thu]) => ({ name, Doanh_thu }))
            .sort((a,b) => parseInt(a.name) - parseInt(b.name)) 
            .slice(-7);

        const hourlyMap: { [hour: number]: { xeVao: number, xeRa: number } } = {};
        for (let i = 0; i < 24; i++) hourlyMap[i] = { xeVao: 0, xeRa: 0 };
        data.sessions.forEach(s => {
            const inHour = new Date(s.inAt).getHours();
            hourlyMap[inHour].xeVao++;
            if (s.outAt) {
                const outHour = new Date(s.outAt).getHours();
                hourlyMap[outHour].xeRa++;
            }
        });
        const hourlyTraffic = Object.entries(hourlyMap).map(([hour, data]) => ({
            name: `${hour}`,
            'Xe vào': data.xeVao,
            'Xe ra': data.xeRa,
        }));

        const occupancyData = [
            { name: 'Đã chiếm', value: data.summary.occupied },
            { name: 'Còn trống', value: availableSpots },
        ];
        
        return {
            summaryData: { totalCarsToday, totalRevenueToday, avgParkingTime, availableSpots },
            dailyRevenue,
            hourlyTraffic,
            occupancyData
        };
    }, [data]);
    
    const SummaryCard: React.FC<{title: string, value: string | number, unit?: string}> = ({title, value, unit}) => (
      <Card className="text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
        <p className="text-2xl lg:text-3xl font-bold mt-1">
          {value} <span className="text-base lg:text-lg font-medium">{unit}</span>
        </p>
      </Card>
    );

    if (!Recharts) {
        return <div className="flex justify-center items-center h-full"><p>Đang tải thư viện biểu đồ...</p></div>;
    }
    
    const { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = Recharts;
    const PIE_COLORS = ['#06b6d4', '#6b7280']; // Cyan, Gray

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Biểu đồ & Thống kê</h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryCard title="Tổng số xe hôm nay" value={summaryData.totalCarsToday} />
                <SummaryCard title="Tổng doanh thu hôm nay" value={summaryData.totalRevenueToday.toLocaleString('vi-VN')} unit="VND" />
                <SummaryCard title="Trung bình thời gian đỗ" value={summaryData.avgParkingTime} />
                <SummaryCard title="Số chỗ trống hiện tại" value={summaryData.availableSpots} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <Card className="lg:col-span-3">
                    <h3 className="font-bold mb-4">Doanh thu theo ngày</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={dailyRevenue}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.3)" />
                            <XAxis dataKey="name" fontSize={12}/>
                            <YAxis fontSize={12} tickFormatter={(value: number) => `${value/1000}k`} />
                            <Tooltip formatter={(value: number) => `${value.toLocaleString('vi-VN')}đ`} cursor={{fill: 'rgba(37, 99, 235, 0.1)'}}/>
                            <Bar dataKey="Doanh_thu" fill="#2563eb" barSize={30} />
                        </BarChart>
                    </ResponsiveContainer>
                </Card>
                 <Card className="lg:col-span-2">
                    <h3 className="font-bold mb-4 text-center">Xe vào/ra theo giờ</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie data={occupancyData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={90} paddingAngle={5} 
                                label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                                    const RADIAN = Math.PI / 180;
                                    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                    const y = cy + radius * Math.sin(-midAngle * RADIAN);

                                    return (
                                        <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" className="font-bold">
                                            {`${(percent * 100).toFixed(0)}%`}
                                        </text>
                                    );
                                }}
                                labelLine={false}
                            >
                                {occupancyData.map((entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke={PIE_COLORS[index % PIE_COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                            <Legend iconType="circle"/>
                        </PieChart>
                    </ResponsiveContainer>
                </Card>
                 <Card className="lg:col-span-3">
                    <h3 className="font-bold mb-4">Lưu lượng xe theo giờ</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={hourlyTraffic} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.3)"/>
                            <XAxis dataKey="name" fontSize={12}/>
                            <YAxis fontSize={12}/>
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="Xe vào" stroke="#2563eb" strokeWidth={2} dot={{r: 4}} activeDot={{r: 6}} />
                            <Line type="monotone" dataKey="Xe ra" stroke="#f59e0b" strokeWidth={2} dot={{r: 4}} activeDot={{r: 6}} />
                        </LineChart>
                    </ResponsiveContainer>
                </Card>
                 <Card className="lg:col-span-2">
                    <h3 className="font-bold mb-4 text-center">Tỷ lệ lấp đầy</h3>
                    <ResponsiveContainer width="100%" height={300}>
                       <PieChart>
                            <Pie data={occupancyData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={90} startAngle={90} endAngle={-270}
                                label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                                    return (
                                        <text x={cx} y={cy} dy={8} textAnchor="middle" fill={PIE_COLORS[0]} className="text-4xl font-bold">
                                            {`${(occupancyData[0].value / (occupancyData[0].value + occupancyData[1].value) * 100).toFixed(0)}%`}
                                        </text>
                                    );
                                }}
                                labelLine={false}
                             >
                                <Cell fill={PIE_COLORS[0]} stroke={PIE_COLORS[0]} />
                                <Cell fill={PIE_COLORS[1]} stroke={PIE_COLORS[1]} />
                             </Pie>
                             <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </Card>
            </div>
        </div>
    );
};

const SearchPage: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const { data } = useFirebase();
    const { user } = useAuth();
    
    const results = useMemo(() => {
        if (!searchTerm) return [];
        return data.sessions.filter(s => s.plate.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [searchTerm, data.sessions]);

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold">Tìm kiếm Lượt gửi</h2>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Nhập biển số xe..."
                    className="flex-grow p-2 border rounded-md dark:bg-zinc-700 dark:border-zinc-600"
                />
                <Button><SearchIcon className="w-5 h-5" /> Tìm</Button>
            </div>

            <div className="space-y-3">
                <h3 className="text-lg font-semibold">Kết quả: {results.length}</h3>
                {results.map(session => (
                    <Card key={session.id}>
                       <p className="font-bold text-lg">{session.plate}</p>
                       <p>Vị trí: {session.spotId}</p>
                       <p>Vào: {new Date(session.inAt).toLocaleString('vi-VN')}</p>
                       <p>Ra: {session.outAt ? new Date(session.outAt).toLocaleString('vi-VN') : 'Hiện đang trong bãi'}</p>
                       {user?.isAdmin && <p>Phí: {session.fee ? `${session.fee.toLocaleString('vi-VN')}đ` : 'N/A'}</p>}
                    </Card>
                ))}
            </div>
        </div>
    );
};

const SettingsPage: React.FC = () => {
    const [feeMethod, setFeeMethod] = useState<'hourly' | 'daily'>('hourly');
    const [hourlyRate, setHourlyRate] = useState(5000);
    const [freeMinutes, setFreeMinutes] = useState(15);
    const [dailyRate, setDailyRate] = useState(30000);

    useEffect(() => {
        const settings = getFeeSettings();
        setFeeMethod(settings.feeMethod);
        setHourlyRate(settings.hourlyRate);
        setFreeMinutes(settings.freeMinutes);
        setDailyRate(settings.dailyRate);
    }, []);

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        const settingsToSave: FeeSettings = {
            feeMethod,
            hourlyRate,
            freeMinutes,
            dailyRate,
        };
        localStorage.setItem('feeSettings', JSON.stringify(settingsToSave));
        alert('Cài đặt đã được lưu!');
    };

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold">Cài đặt</h2>
            <Card>
                <h3 className="font-bold mb-4">Cài đặt phí gửi xe</h3>
                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Phương thức tính phí</label>
                        <div className="flex items-center gap-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="feeMethod" 
                                    value="hourly" 
                                    checked={feeMethod === 'hourly'} 
                                    onChange={() => setFeeMethod('hourly')} 
                                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:bg-zinc-700 dark:border-zinc-600 dark:focus:ring-offset-dark-card"
                                />
                                <span className="text-gray-800 dark:text-dark-text">Tính theo giờ</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="feeMethod" 
                                    value="daily" 
                                    checked={feeMethod === 'daily'} 
                                    onChange={() => setFeeMethod('daily')} 
                                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:bg-zinc-700 dark:border-zinc-600 dark:focus:ring-offset-dark-card"
                                />
                                <span className="text-gray-800 dark:text-dark-text">Tính theo ngày</span>
                            </label>
                        </div>
                    </div>

                    {feeMethod === 'hourly' ? (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Giá mỗi giờ</label>
                                <input type="number" value={hourlyRate} onChange={e => setHourlyRate(Number(e.target.value))} className="mt-1 block w-full p-2 border rounded-md dark:bg-zinc-700 dark:border-zinc-600"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Số phút miễn phí</label>
                                <input type="number" value={freeMinutes} onChange={e => setFreeMinutes(Number(e.target.value))} className="mt-1 block w-full p-2 border rounded-md dark:bg-zinc-700 dark:border-zinc-600"/>
                            </div>
                        </>
                    ) : (
                         <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Giá mỗi ngày</label>
                            <input type="number" value={dailyRate} onChange={e => setDailyRate(Number(e.target.value))} className="mt-1 block w-full p-2 border rounded-md dark:bg-zinc-700 dark:border-zinc-600"/>
                        </div>
                    )}
                    
                    <Button type="submit"><CheckCircleIcon className="w-5 h-5"/> Lưu thay đổi</Button>
                </form>
            </Card>
        </div>
    );
};

const ImagePasteTarget: React.FC<{onPaste: (base64: string) => void, imageUrl: string | null}> = ({ onPaste, imageUrl }) => {
    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        onPaste(reader.result as string);
                    };
                    reader.readAsDataURL(blob);
                }
                break; // only handle first image
            }
        }
    };

    return (
        <div 
            onPaste={handlePaste}
            className="w-24 h-20 flex-shrink-0 border-2 border-dashed rounded-md flex items-center justify-center text-xs text-center text-gray-500 cursor-pointer bg-gray-50 dark:bg-zinc-800"
        >
            {imageUrl ? (
                <img src={imageUrl} alt="Biển số xe" className="w-full h-full object-cover rounded-md" />
            ) : (
                'Dán ảnh vào đây'
            )}
        </div>
    );
};

const DemoPage: React.FC = () => {
    const { data, updateMockData, resetMockData } = useFirebase();
    const [initialData] = useState(() => JSON.parse(JSON.stringify(data)));
    
    const [demoChanges, setDemoChanges] = useState({
        vehicleCount: initialData.summary.occupied,
        plates: {} as { [sessionId: string]: string },
        images: {} as { [sessionId: string]: string },
        feeMultiplier: 1,
        deletedSessionIds: new Set<string>(),
    });
    
    const editableSessions = useMemo(() => {
        const originalOpenSessions = initialData.sessions.filter((s: Session) => s.status === 'open');
        const survivingSessions = originalOpenSessions.filter((s:Session) => !demoChanges.deletedSessionIds.has(s.id));
        
        let sessions = survivingSessions.slice(0, demoChanges.vehicleCount);

        if (demoChanges.vehicleCount > survivingSessions.length) {
            const newCarCount = demoChanges.vehicleCount - survivingSessions.length;
            for (let i = 0; i < newCarCount; i++) {
                const spotId = `S-0${survivingSessions.length + i + 1}`;
                sessions.push({
                    id: `demo-new-sid-${i}`, spotId: spotId, plate: `XE-DEMO-${i + 1}`, imagePathIn: null,
                    lotId: 'lot-1', rfid: '', plateLower: '', inAt: Date.now(), outAt: null, fee: null, imagePathOut: null, status: 'open'
                });
            }
        }
        return sessions;
    }, [demoChanges.vehicleCount, demoChanges.deletedSessionIds, initialData.sessions]);

    const handleDeleteVehicle = (sessionId: string) => {
        setDemoChanges(prev => {
            const newDeletedIds = new Set(prev.deletedSessionIds);
            newDeletedIds.add(sessionId);
            const newCount = prev.vehicleCount -1;
            return {
                ...prev,
                deletedSessionIds: newDeletedIds,
                vehicleCount: Math.max(0, newCount),
            }
        });
    };
    
    const handleApplyDemo = () => {
        const feeSettings = getFeeSettings();
        const originalSpots: Spot[] = JSON.parse(JSON.stringify(initialData.spots));
        const originalSessions: Session[] = JSON.parse(JSON.stringify(initialData.sessions));
        
        const sessionsToCloseIds = new Set(demoChanges.deletedSessionIds);
        
        const initialOpenSessions = originalSessions.filter(s => s.status === 'open');
        const survivingOpenSessionIds = initialOpenSessions
            .filter(s => !sessionsToCloseIds.has(s.id))
            .map(s => s.id);
            
        const sessionsToImplicitlyClose = survivingOpenSessionIds.slice(demoChanges.vehicleCount);
        sessionsToImplicitlyClose.forEach(id => sessionsToCloseIds.add(id));

        const finalOpenSessionIds = new Set(survivingOpenSessionIds.slice(0, demoChanges.vehicleCount));

        let sessionsForUpdate = [...originalSessions];

        const newCarCount = demoChanges.vehicleCount - survivingOpenSessionIds.length;
        if (newCarCount > 0) {
            const occupiedSpotIds = new Set(originalSessions.filter(s=>s.status === 'open').map(s=>s.spotId));
            const availableSpots = originalSpots.filter(s => !occupiedSpotIds.has(s.id));

            for(let i=0; i<newCarCount; i++) {
                const spotToUse = availableSpots[i];
                if(spotToUse) {
                    const newSessionId = `demo-new-sid-${i}`;
                    const newSession: Session = {
                        id: newSessionId, lotId: 'lot-1', spotId: spotToUse.id, rfid: `DEMORFID${i}`,
                        plate: demoChanges.plates[newSessionId] || `XE-DEMO-${i+1}`,
                        plateLower: (demoChanges.plates[newSessionId] || `XE-DEMO-${i+1}`).toLowerCase(),
                        inAt: Date.now() - Math.random() * 3600 * 1000, outAt: null, fee: null, 
                        imagePathIn: demoChanges.images[newSessionId] || `https://picsum.photos/id/${100+i}/200/150`, 
                        imagePathOut: null, status: 'open',
                    };
                    sessionsForUpdate.push(newSession);
                    finalOpenSessionIds.add(newSessionId);
                }
            }
        }
        
        const finalSessions = sessionsForUpdate.map(s => {
            let modified = { ...s };

            // Case 1: Session was open and is now being closed by the demo action.
            if (sessionsToCloseIds.has(s.id) && s.status === 'open') {
                modified.status = 'closed';
                const outAt = Date.now();
                modified.outAt = outAt;
                const { fee, feeType } = calculateFee(s.inAt, outAt, feeSettings);
                // Apply the multiplier ONLY to these newly closed sessions.
                modified.fee = fee * demoChanges.feeMultiplier;
                modified.feeType = feeType;
            }

            // Case 2: Session remains open (or is a new demo session). Update its details if changed.
            if (finalOpenSessionIds.has(s.id)) {
                 if (demoChanges.plates[s.id]) {
                    modified.plate = demoChanges.plates[s.id];
                }
                if (demoChanges.images[s.id]) {
                    modified.imagePathIn = demoChanges.images[s.id];
                }
            }
            
            // Case 3: Session was already closed. Its fee is NOT changed by the multiplier.
            return modified;
        });
        
        const openSessionsAfterUpdate = finalSessions.filter(s => s.status === 'open');
        
        const finalSpots = originalSpots.map(spot => {
            const sessionForSpot = openSessionsAfterUpdate.find(s => s.spotId === spot.id);
            if (sessionForSpot) {
                return { ...spot, occupied: true, currentSessionId: sessionForSpot.id };
            }
            return { ...spot, occupied: false, currentSessionId: null };
        });

        updateMockData({ spots: finalSpots, sessions: finalSessions });
        alert("Đã áp dụng thay đổi Demo!");
    };
    
    const handleFullReset = () => {
        setDemoChanges({
            vehicleCount: initialData.summary.occupied,
            plates: {}, images: {}, feeMultiplier: 1,
            deletedSessionIds: new Set<string>()
        });
        resetMockData();
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div>
                    <h2 className="text-2xl font-bold">Bảng điều khiển Demo</h2>
                    <p className="text-sm text-gray-500 mt-1">Thay đổi dữ liệu mô phỏng để xem các trang khác phản ứng thế nào.</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                    <Button onClick={handleApplyDemo} variant='success'><CheckCircleIcon className="w-5 h-5" /> Áp dụng Demo</Button>
                    <Button onClick={handleFullReset} variant='danger'><RefreshIcon className="w-5 h-5" /> Reset Toàn bộ</Button>
                </div>
            </div>
            
            <Card>
                <h3 className="font-bold">Số lượng xe trong bãi</h3>
                <div className="flex items-center gap-4 mt-2">
                    <span>0</span>
                    <input 
                        type="range" min="0" max={data.summary.total}
                        value={demoChanges.vehicleCount}
                        onChange={(e) => setDemoChanges(p => ({...p, vehicleCount: Number(e.target.value)}))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-600"
                    />
                    <span>{data.summary.total}</span>
                </div>
                 <p className="text-center mt-2 font-bold text-lg">{demoChanges.vehicleCount} / {data.summary.total} xe</p>
            </Card>

             <Card>
                <h3 className="font-bold mb-2">Biển số & Hình ảnh xe trong bãi</h3>
                <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
                    {editableSessions.map(s => (
                        <div key={s.id} className="flex items-center gap-4 py-3">
                            <ImagePasteTarget 
                                imageUrl={demoChanges.images[s.id] || s.imagePathIn}
                                onPaste={(base64) => setDemoChanges(p => ({...p, images: {...p.images, [s.id]: base64}}))}
                            />
                            <div className="flex-1">
                                <label className="font-semibold text-sm text-gray-700 dark:text-gray-300">{s.spotId}:</label>
                                <input 
                                    type="text"
                                    value={demoChanges.plates[s.id] ?? s.plate}
                                    onChange={e => setDemoChanges(p => ({...p, plates: {...p.plates, [s.id]: e.target.value}}))}
                                    className="w-full mt-1 p-2 text-base rounded-lg bg-gray-100 dark:bg-zinc-900 border-transparent focus:ring-2 focus:ring-primary focus:border-transparent"
                                />
                            </div>
                            <button onClick={() => handleDeleteVehicle(s.id)} className="p-2 rounded-full text-gray-400 hover:bg-red-100 hover:text-danger dark:hover:bg-red-900/50 transition-colors">
                                <TrashIcon className="w-5 h-5" />
                            </button>
                        </div>
                    ))}
                </div>
            </Card>

            <Card>
                 <h3 className="font-bold">Mô phỏng Doanh thu</h3>
                 <div className="mt-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hệ số nhân phí:</label>
                    <input 
                        type="number" step="0.1" min="0"
                        value={demoChanges.feeMultiplier}
                        onChange={e => setDemoChanges(p => ({...p, feeMultiplier: Number(e.target.value)}))}
                        className="mt-1 w-full md:w-1/3 p-2 border rounded-md dark:bg-zinc-700 dark:border-zinc-600"
                    />
                </div>
                <p className="text-sm text-gray-500 mt-2">Thay đổi hệ số và nhấn "Áp dụng Demo" để nhân tất cả phí trong lịch sử. Xem kết quả ở trang Biểu đồ.</p>
            </Card>
        </div>
    );
};

const ConnectPage: React.FC = () => {
    const { isConfigured, config, setConfig, testConnection } = useFirebase();
    const { user } = useAuth();
    const [formConfig, setFormConfig] = useState<FirebaseConfig>(config || {
        apiKey: '', authDomain: '', databaseURL: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: '',
    });
    const [testResults, setTestResults] = useState<{firebase: boolean; device: boolean; web: boolean} | null>(null);
    const [isTesting, setIsTesting] = useState(false);
    const [connectionSuccess, setConnectionSuccess] = useState(false);

    useEffect(() => {
        if(config) setFormConfig(config);
    }, [config]);

    const handleInputChange = <K extends keyof FirebaseConfig,>(key: K, value: FirebaseConfig[K]) => {
        setFormConfig(prev => ({ ...prev, [key]: value }));
        setTestResults(null);
        setConnectionSuccess(false);
    };

    const handleConnect = async () => {
        setIsTesting(true);
        setConnectionSuccess(false);
        setConfig(formConfig, false); // temporary connection
        const results = await testConnection();
        setTestResults(results);
        if (results.firebase) {
            setConnectionSuccess(true);
        }
        setIsTesting(false);
    };
    
    const handleSave = () => {
        if (!user?.isAdmin) return;
        setConfig(formConfig, true);
        alert('Đã lưu cấu hình!');
    };
    
    const ConnectionStatus: React.FC<{title: string, status: boolean | null}> = ({ title, status }) => {
        let icon;
        let text;
        let colorClass;

        if (status === null) {
            icon = <AlertTriangleIcon className="w-5 h-5 text-gray-400"/>;
            text = 'Chưa kiểm tra';
            colorClass = 'border-gray-300';
        } else if (status) {
            icon = <CheckCircleIcon className="w-5 h-5 text-success"/>;
            text = 'Kết nối thành công';
            colorClass = 'border-success';
        } else {
            icon = <XCircleIcon className="w-5 h-5 text-danger"/>;
            text = 'Kết nối thất bại';
            colorClass = 'border-danger';
        }

        return (
            <div className={`p-4 border-l-4 ${colorClass} bg-white dark:bg-dark-card shadow-sm flex items-center gap-4 rounded`}>
                {icon}
                <div>
                    <p className="font-semibold">{title}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{text}</p>
                </div>
            </div>
        )
    };
    
    const renderConfigField = (key: keyof FirebaseConfig, label: string) => (
       <div>
            <label className="block text-sm font-medium">{label}</label>
            <input 
                type="text" 
                value={formConfig[key]}
                onChange={e => handleInputChange(key, e.target.value)}
                className="mt-1 w-full p-2 border rounded-md dark:bg-zinc-700 dark:border-zinc-600"
                autoComplete="on"
            />
        </div>
    );

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Kết nối máy chủ</h2>
            <Card>
                <h3 className="font-bold text-lg mb-4">Cấu hình Firebase</h3>
                {connectionSuccess ? (
                    <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/50 text-success rounded-md flex items-center gap-2">
                        <CheckCircleIcon className="w-5 h-5"/>
                        <p>Kiểm tra kết nối thành công! Hệ thống đang sử dụng cấu hình này.</p>
                    </div>
                ) : isConfigured && !testResults ? (
                     <div className="mb-4 p-3 bg-blue-100 dark:bg-blue-900/50 text-primary rounded-md flex items-center gap-2">
                        <AlertTriangleIcon className="w-5 h-5"/>
                        <p>Đã tải cấu hình đã lưu. Nhấn "Kết nối & Kiểm tra" để xác thực.</p>
                    </div>
                ) : null}

                <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                    {renderConfigField('apiKey', 'API Key')}
                    {renderConfigField('authDomain', 'Auth Domain')}
                    {renderConfigField('databaseURL', 'Database URL')}
                    {renderConfigField('projectId', 'Project ID')}
                    {renderConfigField('storageBucket', 'Storage Bucket')}
                    {renderConfigField('messagingSenderId', 'Messaging Sender ID')}
                    {renderConfigField('appId', 'App ID')}
                    <div className="flex flex-col md:flex-row gap-2 pt-2">
                        <Button onClick={handleConnect} className="flex-1" variant="primary" disabled={isTesting}>
                            {isTesting ? 'Đang kiểm tra...' : 'Kết nối & Kiểm tra'}
                        </Button>
                        {user?.isAdmin && (
                            <Button onClick={handleSave} className="flex-1" variant="success" disabled={isTesting || !connectionSuccess}>
                               <LockIcon className="w-4 h-4" /> Lưu cấu hình
                            </Button>
                        )}
                    </div>
                </form>
            </Card>

            <Card>
                <h3 className="font-bold text-lg mb-4">Kết quả kiểm tra</h3>
                <div className="space-y-3">
                    <ConnectionStatus title="Kết nối Firebase" status={testResults?.firebase ?? null} />
                    <ConnectionStatus title="Kết nối Thiết bị (ESP32)" status={testResults?.device ?? null} />
                    <ConnectionStatus title="Kết nối Web App" status={testResults?.web ?? null} />
                </div>
            </Card>
        </div>
    );
};

const LoginPage: React.FC = () => {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from?.pathname || "/";
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await login(email, password);
            navigate(from, { replace: true });
        } catch (err: any) {
            setError(err.message);
        }
    };
    
    return (
        <div className="flex items-center justify-center min-h-[80vh]">
            <Card className="w-full max-w-sm">
                <h2 className="text-2xl font-bold text-center mb-4">Đăng nhập Admin</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label>Email</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-1 w-full p-2 border rounded-md dark:bg-zinc-700 dark:border-zinc-600"/>
                    </div>
                    <div>
                        <label>Mật khẩu</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="mt-1 w-full p-2 border rounded-md dark:bg-zinc-700 dark:border-zinc-600"/>
                    </div>
                    {error && <p className="text-sm text-danger">{error}</p>}
                    <Button type="submit" className="w-full">Đăng nhập</Button>
                </form>
            </Card>
        </div>
    )
};

const NotFoundPage: React.FC = () => (
    <div className="text-center py-10">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="text-lg">Trang không tồn tại</p>
        <Link to="/" className="text-primary hover:underline mt-4 inline-block">Quay về trang chủ</Link>
    </div>
);

const AppRoutes = () => (
    <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/realtime" element={<RealtimePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/charts" element={<ChartsPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/connect" element={<ConnectPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/demo" element={<DemoProtectedRoute><DemoPage /></DemoProtectedRoute>} />
        <Route path="*" element={<NotFoundPage />} />
    </Routes>
);


export default function App() {
    const [isClient, setIsClient] = useState(false);
    useEffect(() => { setIsClient(true) }, []);

    if (!isClient) return null;

    return (
        <UIProvider>
            <AuthProvider>
                <FirebaseProvider>
                    <HashRouter>
                        <MainLayout />
                    </HashRouter>
                </FirebaseProvider>
            </AuthProvider>
        </UIProvider>
    );
}

const MainLayout: React.FC = () => {
    const { viewMode } = useUI();

    if (viewMode === 'mobile') {
        return <MobileLayout><AppRoutes /></MobileLayout>
    }
    return <WebLayout><AppRoutes /></WebLayout>
}
