import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Phone, 
  Shield, 
  AlertTriangle, 
  MapPin, 
  Settings, 
  History, 
  User, 
  Plus, 
  Trash2, 
  Bell, 
  Zap, 
  Volume2,
  X,
  CheckCircle2,
  Github
} from 'lucide-react';

// --- Types ---
interface Contact {
  id: number;
  name: string;
  phone: string;
}

interface AlertHistory {
  id: number;
  type: string;
  location: string;
  trigger_info?: string;
  timestamp: string;
}

interface UserProfile {
  id: number;
  phone: string;
  name?: string;
  sensitivity?: 'low' | 'medium' | 'high';
  github_id?: string;
  github_username?: string;
}

// --- Components ---

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [view, setView] = useState<'login' | 'dashboard' | 'contacts' | 'history' | 'alert' | 'profile'>('login');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [history, setHistory] = useState<AlertHistory[]>([]);
  const [isFlashlightOn, setIsFlashlightOn] = useState(false);
  const [isAlarmOn, setIsAlarmOn] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [location, setLocation] = useState<GeolocationPosition | null>(null);
  const [lastTriggerInfo, setLastTriggerInfo] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const countdownInterval = useRef<NodeJS.Timeout | null>(null);

  // --- Effects ---

  useEffect(() => {
    if (user) {
      fetchContacts();
      fetchHistory();
      setupSensors();
    }
    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [user]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        // Refresh user profile to get GitHub info
        if (user) {
          fetch(`/api/auth/otp/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: user.phone, otp: '000000' }) // Mock re-verify to get updated user
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) setUser(data.user);
          });
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [user]);

  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      countdownInterval.current = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (countdown === 0) {
      triggerEmergency();
    }
    return () => {
      if (countdownInterval.current) clearTimeout(countdownInterval.current);
    };
  }, [countdown]);

  // --- Logic ---

  const setupSensors = () => {
    if (typeof DeviceMotionEvent !== 'undefined' && (DeviceMotionEvent as any).requestPermission) {
      // iOS 13+ requires permission
      (DeviceMotionEvent as any).requestPermission()
        .then((response: string) => {
          if (response === 'granted') {
            window.addEventListener('devicemotion', handleMotion);
          }
        })
        .catch(console.error);
    } else {
      window.addEventListener('devicemotion', handleMotion);
    }
  };

  const handleMotion = (event: DeviceMotionEvent) => {
    const acc = event.accelerationIncludingGravity;
    const rot = event.rotationRate;
    if (!acc) return;

    // Thresholds for accident detection based on sensitivity
    let accThreshold = 35; // Medium default
    let rotThreshold = 500; // Medium default

    if (user?.sensitivity === 'low') {
      accThreshold = 50;
      rotThreshold = 800;
    } else if (user?.sensitivity === 'high') {
      accThreshold = 20;
      rotThreshold = 300;
    }

    const totalAcc = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
    const totalRot = rot ? Math.sqrt((rot.alpha || 0) ** 2 + (rot.beta || 0) ** 2 + (rot.gamma || 0) ** 2) : 0;

    // Trigger SOS if massive impact OR extreme tumbling is detected
    if ((totalAcc > accThreshold || totalRot > rotThreshold) && countdown === null) {
      const info = totalAcc > accThreshold 
        ? `Impact: ${(totalAcc / 9.8).toFixed(1)}G` 
        : `Tumble: ${Math.round(totalRot)}°/s`;
      setLastTriggerInfo(info);
      setCountdown(5);
      setView('alert');
    }
  };

  const fetchContacts = async () => {
    if (!user) return;
    const res = await fetch(`/api/contacts/${user.id}`);
    const data = await res.json();
    setContacts(data);
  };

  const fetchHistory = async () => {
    if (!user) return;
    const res = await fetch(`/api/alerts/${user.id}`);
    const data = await res.json();
    setHistory(data);
  };

  const handleLogin = async () => {
    if (!isOtpSent) {
      await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      setIsOtpSent(true);
    } else {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        setView('dashboard');
      }
    }
  };

  const addContact = async (name: string, phone: string) => {
    if (!user) return;
    await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, name, phone }),
    });
    fetchContacts();
  };

  const deleteContact = async (id: number) => {
    await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    fetchContacts();
  };

  const triggerEmergency = () => {
    setCountdown(null);

    const sendAlert = async (location: string, altitude?: number | null) => {
      let batteryLevel: number | undefined;
      try {
        if ('getBattery' in navigator) {
          const battery: any = await (navigator as any).getBattery();
          batteryLevel = Math.round(battery.level * 100);
        }
      } catch (err) {
        console.error("Error fetching battery level:", err);
      }

      const altInfo = altitude ? ` (Alt: ${Math.round(altitude)}m)` : "";
      const finalLocation = location + altInfo;

      await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: user?.id, 
          type: 'ACCIDENT_DETECTED', 
          location: finalLocation,
          batteryLevel,
          triggerInfo: lastTriggerInfo || "Manual Trigger"
        }),
      });
      
      fetchHistory();
      setLastTriggerInfo(null);
      alert("EMERGENCY ALERT SENT!\n\nAutomated calls and SMS messages have been initiated for all your emergency contacts.");
      setView('dashboard');
    };

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const locStr = `${pos.coords.latitude},${pos.coords.longitude}`;
        const mapsLink = `https://www.google.com/maps?q=${locStr}`;
        await sendAlert(mapsLink, pos.coords.altitude);
      },
      async (err) => {
        console.warn("GPS failed, trying IP fallback:", err.message);
        try {
          // Fallback to IP-based geolocation if GPS is off
          const response = await fetch('https://ipapi.co/json/');
          const data = await response.json();
          if (data.latitude && data.longitude) {
            const mapsLink = `https://www.google.com/maps?q=${data.latitude},${data.longitude}`;
            await sendAlert(mapsLink + " (IP-based)", null);
          } else {
            throw new Error("IP Geolocation failed");
          }
        } catch (fallbackErr) {
          console.error("Fallback failed:", fallbackErr);
          await sendAlert("Location Unavailable (GPS/IP Off)", null);
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const toggleFlashlight = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities() as any;
      
      if (capabilities.torch) {
        await track.applyConstraints({
          advanced: [{ torch: !isFlashlightOn } as any]
        });
        setIsFlashlightOn(!isFlashlightOn);
      } else {
        alert("Flashlight not supported on this device.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleAlarm = () => {
    if (!isAlarmOn) {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime); // 1000Hz tone
      
      // Create a pulsing effect
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      for (let i = 0; i < 100; i++) {
        gainNode.gain.linearRampToValueAtTime(1, audioCtx.currentTime + i * 0.5);
        gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + i * 0.5 + 0.25);
      }

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.start();
      (audioRef.current as any) = { oscillator, audioCtx };
    } else {
      if (audioRef.current) {
        const { oscillator, audioCtx } = audioRef.current as any;
        oscillator.stop();
        audioCtx.close();
        audioRef.current = null;
      }
    }
    setIsAlarmOn(!isAlarmOn);
  };

  const connectGitHub = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/auth/github/url');
      const { url, error } = await res.json();
      if (error) {
        alert(error);
        return;
      }
      // Add state (userId) to the URL
      const authUrl = new URL(url);
      authUrl.searchParams.set('state', user.id.toString());
      
      window.open(authUrl.toString(), 'github_oauth', 'width=600,height=700');
    } catch (err) {
      console.error(err);
    }
  };

  const updateProfile = async (name: string, sensitivity: string) => {
    if (!user) return;
    const res = await fetch('/api/user/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, name, sensitivity }),
    });
    const data = await res.json();
    if (data.success) {
      setUser(data.user);
      alert("Profile updated!");
    }
  };

  // --- Render Helpers ---

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-slate-100"
        >
          <div className="flex justify-center mb-6">
            <div className="bg-red-500 p-4 rounded-2xl shadow-lg shadow-red-200">
              <Shield className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">Guardian</h1>
          <p className="text-slate-500 text-center mb-8">Emergency Helper System</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input 
                  type="tel" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 234 567 890"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>

            {isOtpSent && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                <label className="block text-sm font-semibold text-slate-700 mb-1">OTP Code</label>
                <input 
                  type="text" 
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all"
                />
              </motion.div>
            )}

            <button 
              onClick={handleLogin}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-red-200 transition-all active:scale-95"
            >
              {isOtpSent ? 'Verify & Login' : 'Send OTP'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 px-6 py-4 sticky top-0 z-10 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-red-500" />
          <span className="font-bold text-slate-800">Guardian</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setView('history')} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <History className="w-5 h-5 text-slate-600" />
          </button>
          <button onClick={() => setView('profile')} className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center hover:bg-slate-300 transition-colors">
            <User className="w-5 h-5 text-slate-500" />
          </button>
        </div>
      </header>

      <main className="p-6 max-w-lg mx-auto">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* Status Card */}
              <div className="bg-emerald-500 rounded-3xl p-6 text-white shadow-lg shadow-emerald-100">
                <div className="flex justify-between items-start mb-4">
                  <div className="bg-white/20 p-2 rounded-lg">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-2 py-1 rounded">Active</span>
                </div>
                <h2 className="text-xl font-bold mb-1">System Armed</h2>
                <p className="text-emerald-50 opacity-90 text-sm">Accident detection is active. We're watching over you.</p>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={toggleFlashlight}
                  className={`p-6 rounded-3xl flex flex-col items-center gap-3 transition-all ${isFlashlightOn ? 'bg-yellow-400 text-white shadow-yellow-100' : 'bg-white text-slate-600 shadow-sm border border-slate-100'}`}
                >
                  <Zap className="w-8 h-8" />
                  <span className="font-semibold">Flashlight</span>
                </button>
                <button 
                  onClick={toggleAlarm}
                  className={`p-6 rounded-3xl flex flex-col items-center gap-3 transition-all ${isAlarmOn ? 'bg-red-500 text-white shadow-red-100' : 'bg-white text-slate-600 shadow-sm border border-slate-100'}`}
                >
                  <Volume2 className="w-8 h-8" />
                  <span className="font-semibold">Alarm</span>
                </button>
              </div>

              {/* SOS Button */}
              <button 
                onClick={() => { setCountdown(5); setView('alert'); }}
                className="w-full aspect-square max-w-[280px] mx-auto bg-red-500 rounded-full flex flex-col items-center justify-center gap-2 shadow-2xl shadow-red-200 border-[12px] border-white active:scale-95 transition-transform"
              >
                <AlertTriangle className="w-16 h-16 text-white" />
                <span className="text-3xl font-black text-white tracking-tighter">SOS</span>
                <span className="text-red-100 text-xs font-bold uppercase">Hold for 3s</span>
              </button>

              {/* Emergency Contacts Preview */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-800">Emergency Contacts</h3>
                  <button onClick={() => setView('contacts')} className="text-red-500 text-sm font-bold">Manage</button>
                </div>
                <div className="space-y-3">
                  {contacts.length === 0 ? (
                    <p className="text-slate-400 text-sm italic">No contacts added yet.</p>
                  ) : (
                    contacts.slice(0, 2).map(c => (
                      <div key={c.id} className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-slate-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{c.name}</p>
                          <p className="text-slate-500 text-xs">{c.phone}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'contacts' && (
            <motion.div 
              key="contacts"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4 mb-2">
                <button onClick={() => setView('dashboard')} className="p-2 hover:bg-slate-100 rounded-full">
                  <X className="w-6 h-6 text-slate-600" />
                </button>
                <h2 className="text-xl font-bold text-slate-800">Manage Contacts</h2>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-4">Add New Contact</h3>
                <div className="space-y-4">
                  <input 
                    id="new-contact-name"
                    type="text" 
                    placeholder="Name" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  />
                  <input 
                    id="new-contact-phone"
                    type="tel" 
                    placeholder="Phone Number" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  />
                  <button 
                    onClick={() => {
                      const name = (document.getElementById('new-contact-name') as HTMLInputElement).value;
                      const phone = (document.getElementById('new-contact-phone') as HTMLInputElement).value;
                      if (name && phone) {
                        addContact(name, phone);
                        (document.getElementById('new-contact-name') as HTMLInputElement).value = '';
                        (document.getElementById('new-contact-phone') as HTMLInputElement).value = '';
                      }
                    }}
                    className="w-full bg-red-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-red-100"
                  >
                    Add Contact
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {contacts.map(c => (
                  <div key={c.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-slate-400" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{c.name}</p>
                        <p className="text-slate-500 text-sm">{c.phone}</p>
                      </div>
                    </div>
                    <button onClick={() => deleteContact(c.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4 mb-2">
                <button onClick={() => setView('dashboard')} className="p-2 hover:bg-slate-100 rounded-full">
                  <X className="w-6 h-6 text-slate-600" />
                </button>
                <h2 className="text-xl font-bold text-slate-800">Alert History</h2>
              </div>

              <div className="space-y-3">
                {history.length === 0 ? (
                  <div className="text-center py-12">
                    <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400">No alerts triggered yet.</p>
                  </div>
                ) : (
                  history.map(h => (
                    <div key={h.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-red-500 uppercase tracking-wider">{h.type.replace('_', ' ')}</span>
                          {h.trigger_info && (
                            <span className="text-[10px] font-medium text-slate-500 mt-0.5 flex items-center gap-1">
                              <Zap className="w-3 h-3 text-yellow-500" />
                              {h.trigger_info}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400">{new Date(h.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                        <a href={h.location} target="_blank" rel="noreferrer" className="text-sm text-blue-500 underline break-all">
                          {h.location}
                        </a>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {view === 'profile' && (
            <motion.div 
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4 mb-2">
                <button onClick={() => setView('dashboard')} className="p-2 hover:bg-slate-100 rounded-full">
                  <X className="w-6 h-6 text-slate-600" />
                </button>
                <h2 className="text-xl font-bold text-slate-800">Your Profile</h2>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Your Name</label>
                    <input 
                      id="user-name-input"
                      type="text" 
                      defaultValue={user.name || ''}
                      placeholder="Enter your full name" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Phone Number</label>
                    <input 
                      type="text" 
                      value={user.phone}
                      disabled
                      className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl outline-none text-slate-500 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Detection Sensitivity</label>
                    <select 
                      id="user-sensitivity-select"
                      defaultValue={user.sensitivity || 'medium'}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    >
                      <option value="low">Low (Less Sensitive)</option>
                      <option value="medium">Medium (Default)</option>
                      <option value="high">High (More Sensitive)</option>
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1 px-1">
                      High sensitivity triggers more easily. Low sensitivity requires a harder impact.
                    </p>
                  </div>

                  <div className="pt-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Integrations</label>
                    {user.github_username ? (
                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="flex items-center gap-3">
                          <Github className="w-5 h-5 text-slate-800" />
                          <div>
                            <p className="text-sm font-bold text-slate-800">GitHub Connected</p>
                            <p className="text-xs text-slate-500">@{user.github_username}</p>
                          </div>
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      </div>
                    ) : (
                      <button 
                        onClick={connectGitHub}
                        className="w-full flex items-center justify-center gap-3 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-colors"
                      >
                        <Github className="w-5 h-5" />
                        Connect GitHub
                      </button>
                    )}
                  </div>

                  <button 
                    onClick={() => {
                      const name = (document.getElementById('user-name-input') as HTMLInputElement).value;
                      const sensitivity = (document.getElementById('user-sensitivity-select') as HTMLSelectElement).value;
                      updateProfile(name, sensitivity);
                    }}
                    className="w-full bg-red-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-red-100"
                  >
                    Save Profile
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'alert' && (
            <motion.div 
              key="alert"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="fixed inset-0 z-50 bg-red-600 flex flex-col items-center justify-center p-8 text-white"
            >
              <motion.div 
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="bg-white/20 p-8 rounded-full mb-8"
              >
                <AlertTriangle className="w-24 h-24 text-white" />
              </motion.div>
              
              <h1 className="text-4xl font-black mb-2 text-center">EMERGENCY DETECTED</h1>
              <p className="text-red-100 text-center mb-12 opacity-90">Initiating automated calls and SMS alerts in...</p>
              
              <div className="text-9xl font-black mb-16 tabular-nums">{countdown}</div>
              
              <button 
                onClick={() => { setCountdown(null); setView('dashboard'); }}
                className="w-full max-w-xs bg-white text-red-600 font-black py-6 rounded-3xl shadow-2xl text-xl active:scale-95 transition-transform"
              >
                I AM SAFE (CANCEL)
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Nav */}
      {view !== 'alert' && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-6 py-4 flex justify-around items-center z-10">
          <button onClick={() => setView('dashboard')} className={`flex flex-col items-center gap-1 ${view === 'dashboard' ? 'text-red-500' : 'text-slate-400'}`}>
            <Shield className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">Home</span>
          </button>
          <button onClick={() => setView('contacts')} className={`flex flex-col items-center gap-1 ${view === 'contacts' ? 'text-red-500' : 'text-slate-400'}`}>
            <User className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">Contacts</span>
          </button>
          <button onClick={() => setView('history')} className={`flex flex-col items-center gap-1 ${view === 'history' ? 'text-red-500' : 'text-slate-400'}`}>
            <History className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">History</span>
          </button>
        </nav>
      )}
    </div>
  );
}
