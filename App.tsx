import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Settings as SettingsIcon, Plus, Play, Pause, Disc } from 'lucide-react';

import Library from './components/Library';
import Settings from './components/Settings';
import FullPlayer from './components/FullPlayer';
import Visualizer from './components/Visualizer';
import SplashScreen from './components/SplashScreen';

import { Track, AppSettings, AIState, LyricLine } from './types';
import { useCrossfadePlayer } from './hooks/useCrossfadePlayer';
import { generateDJIntro, decodeAudioData, fetchLyrics } from './services/geminiService';
import { useAudioVisualizer } from './hooks/useAudioVisualizer';

const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [fadeSplash, setFadeSplash] = useState(false);
  
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [activeView, setActiveView] = useState<'library' | 'settings'>('library');
  
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'burgundy',
    crossfadeDuration: 3,
    showNavBar: true,
    playerThemeMode: 'solid',
    adaptiveBrightness: 25,
    adaptiveSaturation: 40,
    enableAmbientEffect: true
  });

  const [aiState, setAiState] = useState<AIState>({
    isLoading: false,
    error: null,
    generatedText: null,
    isPlayingVoice: false,
    isFetchingLyrics: false
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeSplash(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const handleSplashEnd = () => {
    setShowSplash(false);
  };

  const { 
    activePlayer, 
    playTrack: enginePlayTrack, 
    togglePlayPause, 
    seek, 
    playState, 
    currentTime, 
    duration,
    volume,
    setVolume
  } = useCrossfadePlayer(settings.crossfadeDuration);

  const { getFrequencyData } = useAudioVisualizer(activePlayer);
  const aiVoiceContextRef = useRef<AudioContext | null>(null);

  const currentTrack = currentTrackIndex !== -1 ? tracks[currentTrackIndex] : null;

  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album || 'Nebula Player',
        artwork: [
          { src: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png', sizes: '512x512', type: 'image/png' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
      navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
      navigator.mediaSession.setActionHandler('previoustrack', () => handlePrev());
      navigator.mediaSession.setActionHandler('nexttrack', () => handleNext());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) seek(details.seekTime);
      });
    }
  }, [currentTrack, playState]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = playState === 1 ? 'playing' : 'paused';
    }
  }, [playState]);

  const processFiles = (files: FileList) => {
    const newTracks: Track[] = Array.from(files)
      .filter(file => file.type.startsWith('audio/'))
      .map((file: File) => {
        const parts = file.name.replace(/\.[^/.]+$/, "").split('-');
        const artist = parts.length > 1 ? parts[0].trim() : "Unknown Artist";
        const title = parts.length > 1 ? parts[1].trim() : parts[0].trim();

        return {
            id: crypto.randomUUID(),
            file,
            title: title,
            artist: artist,
            album: "Unknown Album",
            url: URL.createObjectURL(file),
            duration: 0,
            isLiked: false
        };
      });
      
    if (newTracks.length > 0) {
      setTracks((prev) => {
        const existingNames = new Set(prev.map(t => t.file.name));
        const uniqueNew = newTracks.filter(t => !existingNames.has(t.file.name));
        return [...prev, ...uniqueNew];
      });
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      processFiles(event.target.files);
    }
  };

  const handleFolderImport = (files: FileList) => {
    processFiles(files);
  };
  
  const handleRefreshLibrary = () => {
     console.log("Library refreshed");
  };

  const playIndex = (index: number) => {
    if (index >= 0 && index < tracks.length) {
        setCurrentTrackIndex(index);
        enginePlayTrack(tracks[index]);
        setAiState(prev => ({ ...prev, generatedText: null, error: null }));
    }
  };

  const handleNext = () => {
    if (tracks.length === 0) return;
    const nextIndex = (currentTrackIndex + 1) % tracks.length;
    playIndex(nextIndex);
  };

  const handlePrev = () => {
    if (tracks.length === 0) return;
    const prevIndex = currentTrackIndex === 0 ? tracks.length - 1 : currentTrackIndex - 1;
    playIndex(prevIndex);
  };

  const toggleLike = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTracks(prev => prev.map(t => t.id === id ? { ...t, isLiked: !t.isLiked } : t));
  };

  const handleFetchLyrics = async () => {
    if (!currentTrack || currentTrack.lyrics) return;
    setAiState(prev => ({ ...prev, isFetchingLyrics: true }));
    try {
      const lyricLines = await fetchLyrics(currentTrack.title, currentTrack.artist, duration);
      setTracks(prev => prev.map(t => t.id === currentTrack.id ? { ...t, lyrics: lyricLines } : t));
    } catch (e) {
      console.error("Lyrics failed", e);
    } finally {
      setAiState(prev => ({ ...prev, isFetchingLyrics: false }));
    }
  };

  useEffect(() => {
    if (duration > 0 && currentTime >= duration - 0.5 && playState !== 0) {
        handleNext();
    }
  }, [currentTime, duration]);

  const handleAiAction = async () => {
    if (!currentTrack) return;
    setAiState(prev => ({ ...prev, isLoading: true }));
    try {
        const response = await generateDJIntro(currentTrack.title, currentTrack.artist);
        if (response.text) {
             setAiState(prev => ({ ...prev, generatedText: response.text }));
        }
        if (response.audioData) {
             if (!aiVoiceContextRef.current) {
                 aiVoiceContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
             }
             const ctx = aiVoiceContextRef.current;
             const buffer = await decodeAudioData(response.audioData, ctx);
             if (activePlayer) activePlayer.volume = 0.2;
             const source = ctx.createBufferSource();
             source.buffer = buffer;
             source.connect(ctx.destination);
             setAiState(prev => ({ ...prev, isLoading: false, isPlayingVoice: true }));
             source.onended = () => {
                 setAiState(prev => ({ ...prev, isPlayingVoice: false }));
                 if (activePlayer) {
                    const restore = setInterval(() => {
                        if (activePlayer.volume < 1) activePlayer.volume += 0.1;
                        else clearInterval(restore);
                    }, 100);
                 }
             };
             source.start(0);
        } else {
            setAiState(prev => ({ ...prev, isLoading: false }));
        }
    } catch (e) {
        setAiState(prev => ({ ...prev, isLoading: false, error: "AI failed" }));
    }
  };

  const getThemeColors = () => {
    if (settings.playerThemeMode === 'solid' || !currentTrack) {
        switch(settings.theme) {
            case 'midnight': return 'bg-slate-900 text-slate-200';
            case 'forest': return 'bg-[#064e3b] text-emerald-100';
            case 'ocean': return 'bg-[#1e3a8a] text-blue-100';
            case 'burgundy': default: return 'bg-[#2a0a0a] text-rose-100'; 
        }
    }
    return 'text-white bg-black';
  };

  const getAccentColor = () => {
      if (settings.playerThemeMode === 'adaptive' && currentTrack) {
          return 'text-white bg-white/20';
      }
      switch(settings.theme) {
          case 'midnight': return 'text-indigo-400';
          case 'forest': return 'text-emerald-400';
          case 'ocean': return 'text-blue-400';
          case 'burgundy': default: return 'text-rose-400';
      }
  };

  const adaptiveTheme = useMemo(() => {
    if (!currentTrack || settings.playerThemeMode === 'solid') return null;
    const str = currentTrack.title + currentTrack.artist + (currentTrack.album || 'unknown');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    const s = settings.adaptiveSaturation; 
    const l = settings.adaptiveBrightness;
    const accentS = Math.min(s + 30, 90);
    const accentL = Math.min(l + 40, 80);
    return {
        background: `hsl(${h}, ${s}%, ${l}%)`,
        accent: `hsl(${h}, ${accentS}%, ${accentL}%)`,
        rawHue: h
    };
  }, [currentTrack, settings.playerThemeMode, settings.adaptiveBrightness, settings.adaptiveSaturation]);

  return (
    <>
      {showSplash && <SplashScreen fadeOut={fadeSplash} onAnimationEnd={handleSplashEnd} />}
      
      <div 
        className={`fixed inset-0 overflow-hidden font-sans transition-all duration-1000 ${getThemeColors()}`}
        style={adaptiveTheme ? {
            background: `linear-gradient(to bottom, ${adaptiveTheme.background} 0%, #000000 100%)`
        } : {}}
      >
        {settings.playerThemeMode === 'adaptive' && settings.enableAmbientEffect && adaptiveTheme && (
            <>
                <div 
                    className="fixed top-[-30%] left-[-20%] w-[80%] h-[80%] rounded-full opacity-30 blur-[120px] pointer-events-none transition-colors duration-1000"
                    style={{ backgroundColor: adaptiveTheme.accent }}
                />
                 <div 
                    className="fixed bottom-[-30%] right-[-20%] w-[80%] h-[80%] rounded-full opacity-20 blur-[150px] pointer-events-none transition-colors duration-1000"
                    style={{ backgroundColor: adaptiveTheme.background }}
                />
            </>
        )}
        
        <header className="absolute top-0 left-0 right-0 h-24 flex items-center justify-between px-6 z-20 bg-gradient-to-b from-black/40 to-transparent pt-safe">
          <div className="flex items-center space-x-2">
              <div className={`p-2 rounded-xl bg-white/10 transition-colors duration-500 ${getAccentColor()}`}>
                  <Disc size={24} />
              </div>
              <h1 className="text-xl font-bold tracking-tight">Nebula</h1>
          </div>
          
          <div className="flex items-center space-x-4">
               <button 
                  onClick={() => setActiveView(activeView === 'library' ? 'settings' : 'library')}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
               >
                   <SettingsIcon size={24} />
               </button>
               <label className={`p-3 rounded-full text-white shadow-lg cursor-pointer transition-transform active:scale-95 bg-white/10 hover:bg-white/20`}>
                  <Plus size={24} />
                  <input type="file" multiple accept="audio/*" onChange={handleFileUpload} className="hidden" />
              </label>
          </div>
        </header>

        <main className={`absolute top-24 bottom-24 left-0 right-0 overflow-hidden transition-all duration-1000 pb-safe ${showSplash ? 'opacity-0 translate-y-10' : 'opacity-100 translate-y-0'}`}>
          {activeView === 'library' ? (
              <Library 
                  tracks={tracks} 
                  onPlay={playIndex} 
                  onToggleLike={toggleLike}
                  currentTrackId={currentTrack?.id}
              />
          ) : (
              <Settings 
                  settings={settings} 
                  onUpdateSettings={setSettings} 
                  onBack={() => setActiveView('library')}
                  onImportFolder={handleFolderImport}
                  onRefreshLibrary={handleRefreshLibrary}
                  trackCount={tracks.length}
              />
          )}
        </main>

        {currentTrack && !isPlayerOpen && (
          <div 
              onClick={() => setIsPlayerOpen(true)}
              className="fixed bottom-6 left-4 right-4 h-16 bg-white/10 backdrop-blur-xl border border-white/10 rounded-full flex items-center px-2 pr-4 shadow-2xl z-30 cursor-pointer animate-slide-up mb-safe"
          >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-3 shrink-0 ${playState === 1 ? 'animate-spin-slow' : ''} bg-black/40 overflow-hidden border border-white/10`}>
                   <Visualizer getFrequencyData={getFrequencyData} isPlaying={playState === 1} color="white" />
              </div>
              
              <div className="flex-1 min-w-0 mr-4">
                  <h4 className="font-bold text-sm truncate text-white">{currentTrack.title}</h4>
                  <p className="text-xs text-white/50 truncate">{currentTrack.artist}</p>
              </div>

              <button 
                  onClick={(e) => { e.stopPropagation(); togglePlayPause(); }}
                  className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
              >
                  {playState === 1 ? <Pause size={18} fill="black"/> : <Play size={18} fill="black" className="ml-0.5"/>}
              </button>
          </div>
        )}

        {isPlayerOpen && currentTrack && (
          <FullPlayer 
              track={currentTrack}
              isPlaying={playState === 1}
              currentTime={currentTime}
              duration={duration}
              volume={volume}
              onPlayPause={togglePlayPause}
              onNext={handleNext}
              onPrev={handlePrev}
              onSeek={seek}
              onVolumeChange={setVolume}
              onClose={() => setIsPlayerOpen(false)}
              onToggleLike={() => toggleLike(currentTrack.id)}
              getFrequencyData={getFrequencyData}
              aiState={aiState}
              onAiAction={handleAiAction}
              onFetchLyrics={handleFetchLyrics}
              themeColor={adaptiveTheme?.background}
              accentColor={adaptiveTheme?.accent}
              enableAmbient={settings.playerThemeMode === 'adaptive' && settings.enableAmbientEffect}
          />
        )}
        
        {settings.playerThemeMode === 'solid' && (
            <>
                <div className="fixed top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-white/5 blur-[100px] pointer-events-none" />
                <div className="fixed bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-black/40 blur-[100px] pointer-events-none" />
            </>
        )}
      </div>
    </>
  );
};

export default App;