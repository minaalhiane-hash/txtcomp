import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, Book, Eye, EyeOff, Volume2, StopCircle, Loader2 } from 'lucide-react';
import { StoryData } from '../types';
import { generateSpeech } from '../services/geminiService';
import { Button } from './Button';

interface StoryCardProps {
  data: StoryData;
}

export const StoryCard: React.FC<StoryCardProps> = ({ data }) => {
  const [showText, setShowText] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    // Cleanup audio on unmount
    return () => {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const handlePlayAudio = async () => {
    if (isPlaying) {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        sourceNodeRef.current = null;
      }
      setIsPlaying(false);
      return;
    }

    setIsAudioLoading(true);
    try {
      // 1. Get raw audio data (PCM)
      const base64Audio = await generateSpeech(data.content);
      
      // 2. Init Audio Context
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;

      // 3. Decode Base64 to binary
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // 4. Convert PCM (Int16) to AudioBuffer (Float32)
      const dataInt16 = new Int16Array(bytes.buffer);
      const numChannels = 1;
      const sampleRate = 24000;
      const frameCount = dataInt16.length / numChannels;
      const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
      
      for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
           // Normalize 16-bit PCM to [-1.0, 1.0]
           channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
      }

      // 5. Play
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlaying(false);
      source.start();
      
      sourceNodeRef.current = source;
      setIsPlaying(true);

    } catch (error) {
      console.error("Audio error:", error);
      alert("Impossible de lire le texte pour le moment.");
    } finally {
      setIsAudioLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden max-w-4xl mx-auto border border-slate-200">
      <div className="bg-indigo-50 p-6 border-b border-indigo-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-3xl font-bold text-indigo-900 font-comic flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-indigo-600" />
          {data.title}
        </h2>
        
        <Button 
          onClick={handlePlayAudio}
          disabled={isAudioLoading}
          variant="secondary"
          className="shrink-0 py-2 px-4 text-sm"
        >
           {isAudioLoading ? (
             <><Loader2 className="w-4 h-4 animate-spin" /> Chargement...</>
           ) : isPlaying ? (
             <><StopCircle className="w-4 h-4 text-red-500" /> Arrêter la lecture</>
           ) : (
             <><Volume2 className="w-4 h-4 text-indigo-600" /> Écouter le texte</>
           )}
        </Button>
      </div>
      
      {/* Image Display */}
      {data.imageUrl && (
        <div className="w-full bg-slate-100 flex justify-center p-4 border-b border-slate-200">
          <img 
            src={data.imageUrl} 
            alt="Texte à lire" 
            className="max-h-[600px] w-auto object-contain rounded-lg shadow-sm"
          />
        </div>
      )}

      {/* Transcription Toggle */}
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-end">
        <button 
          onClick={() => setShowText(!showText)}
          className="text-indigo-600 text-sm font-bold flex items-center gap-2 hover:text-indigo-800 transition-colors"
        >
          {showText ? <><EyeOff className="w-4 h-4" /> Masquer le texte transcrit</> : <><Eye className="w-4 h-4" /> Voir le texte transcrit (Aide)</>}
        </button>
      </div>
      
      {/* Transcribed Text (Hidden by default if image exists) */}
      {showText && (
        <div className="p-8 text-lg leading-relaxed text-slate-700 whitespace-pre-wrap font-medium bg-white animate-in slide-in-from-top-2">
          {data.content}
        </div>
      )}

      {data.glossary.length > 0 && (
        <div className="bg-amber-50 p-6 border-t border-amber-100">
          <h3 className="text-xl font-bold text-amber-800 mb-4 flex items-center gap-2 font-comic">
            <Book className="w-5 h-5" />
            Glossaire
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.glossary.map((item, index) => (
              <div key={index} className="bg-white/80 p-3 rounded-lg border border-amber-200">
                <span className="font-bold text-amber-900">{item.word} : </span>
                <span className="text-amber-800">{item.definition}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
