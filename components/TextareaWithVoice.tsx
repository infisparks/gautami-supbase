"use client";

import React, { useEffect, useRef } from "react";
import { Mic, MicOff } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UseFormRegister } from "react-hook-form";
import { toast } from "sonner";

// ----------- Web Speech API type patch -----------
type _SpeechRecognition =
  typeof window extends { SpeechRecognition: infer T }
    ? T
    : typeof window extends { webkitSpeechRecognition: infer W }
      ? W
      : any;

// Events are not constructable; we use them as types only.
declare global {
  interface Window {
    SpeechRecognition: _SpeechRecognition;
    webkitSpeechRecognition: _SpeechRecognition;
  }
  // TypeScript's DOM lib defines the following types in supporting environments.
  interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
  }
  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
  }
}
// ----------- End type patch -----------

type FormFields = Record<string, string | null | undefined>;

interface TextareaWithVoiceProps {
  label: string;
  icon: React.ReactNode;
  field: string;
  register: UseFormRegister<FormFields>;
  isRecording: boolean;
  startRecording: (fieldName: string) => void;
  stopRecording: () => void;
  placeholder: string;
  currentValue: string | null | undefined;
  setValue: (name: string, value: any, options?: Record<string, any>) => void;
}

export default function TextareaWithVoice({
  label,
  icon,
  field,
  register,
  isRecording,
  startRecording,
  stopRecording,
  placeholder,
  currentValue,
  setValue,
}: TextareaWithVoiceProps) {
  const recognitionRef = useRef<any>(null);

  // Voice transcription logic
  const handleStartRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    startRecording(field);

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI();
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-IN";

      recognition.onresult = (event: any) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          const val = (currentValue ? currentValue + " " : "") + finalTranscript.trim();
          setValue(field, val, { shouldDirty: true });
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error, event.message);
        toast.error(`Speech recognition error: ${event.error}`);
        stopRecording();
        recognitionRef.current = null;
      };

      recognition.onend = () => {
        if (isRecording) {
          stopRecording();
          recognitionRef.current = null;
        }
      };

      try {
        recognition.start();
        console.log("Speech recognition started for field:", field);
      } catch (e) {
        console.error("Error starting speech recognition:", e);
        toast.error(
          "Could not start voice recording. Check permissions or try a different browser (Chrome/Edge recommended)."
        );
        stopRecording();
        recognitionRef.current = null;
      }
    } else {
      toast.error("Speech recognition is not supported in your browser. Please use Chrome or Edge.");
      stopRecording();
    }
  };

  const handleStopRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        console.log("Speech recognition stopped by user for field:", field);
      } catch (e) {
        console.error("Error stopping speech recognition:", e);
      }
    }
    stopRecording();
    recognitionRef.current = null;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between">
        <label className="flex items-center text-sm font-medium text-teal-800 gap-1.5 mb-2 sm:mb-0">
          {icon}
          {label}
        </label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant={isRecording ? "destructive" : "outline"}
                className={`h-8 w-full sm:w-[140px] text-sm ${
                  isRecording
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "border-teal-200 text-teal-700 hover:bg-teal-100"
                }`}
                onClick={isRecording ? handleStopRecording : handleStartRecording}
              >
                {isRecording ? (
                  <>
                    <MicOff className="h-4 w-4 mr-1 flex-shrink-0" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-1 flex-shrink-0" />
                    Voice Input
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isRecording
                ? `Stop voice recording for ${label}`
                : `Start voice recording for ${label}`}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div
        className={`relative ${
          isRecording ? "ring-2 ring-red-500 rounded-md" : ""
        }`}
      >
        <Textarea
          {...register(field)}
          placeholder={placeholder}
          className={`min-h-[120px] w-full border-teal-200 focus:border-teal-500 focus:ring-teal-500 pr-10 resize-y text-base ${
            isRecording
              ? "border-red-500 focus:border-red-600 focus:ring-red-600"
              : ""
          }`}
        />
        {isRecording && (
          <div className="absolute top-2 right-2 flex items-center gap-1 pointer-events-none">
            <span className="animate-pulse h-2 w-2 bg-red-500 rounded-full"></span>
            <span
              className="animate-pulse h-2 w-2 bg-red-500 rounded-full"
              style={{ animationDelay: "0.2s" }}
            ></span>
            <span
              className="animate-pulse h-2 w-2 bg-red-500 rounded-full"
              style={{ animationDelay: "0.4s" }}
            ></span>
          </div>
        )}
      </div>
    </div>
  );
}
