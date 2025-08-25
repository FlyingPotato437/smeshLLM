"use client";

import { useEffect, useRef, useCallback } from "react";
import { useState } from "react";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
    FileSpreadsheet,
    BarChart3,
    TrendingUp,
    MessageSquare,
    ArrowUpIcon,
    Paperclip,
    PlusIcon,
    Home,
} from "lucide-react";

interface UseAutoResizeTextareaProps {
    minHeight: number;
    maxHeight?: number;
}

function useAutoResizeTextarea({
    minHeight,
    maxHeight,
}: UseAutoResizeTextareaProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const adjustHeight = useCallback(
        (reset?: boolean) => {
            const textarea = textareaRef.current;
            if (!textarea) return;

            if (reset) {
                textarea.style.height = `${minHeight}px`;
                return;
            }

            // Temporarily shrink to get the right scrollHeight
            textarea.style.height = `${minHeight}px`;

            // Calculate new height
            const newHeight = Math.max(
                minHeight,
                Math.min(
                    textarea.scrollHeight,
                    maxHeight ?? Number.POSITIVE_INFINITY
                )
            );

            textarea.style.height = `${newHeight}px`;
        },
        [minHeight, maxHeight]
    );

    useEffect(() => {
        // Set initial height
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = `${minHeight}px`;
        }
    }, [minHeight]);

    // Adjust height on window resize
    useEffect(() => {
        const handleResize = () => adjustHeight();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [adjustHeight]);

    return { textareaRef, adjustHeight };
}

export function VercelV0Chat() {
    const [value, setValue] = useState("");
    const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { textareaRef, adjustHeight } = useAutoResizeTextarea({
        minHeight: 60,
        maxHeight: 200,
    });

    const handleSubmit = async () => {
        if (!value.trim() || isLoading) return;

        const newMessage = { role: "user", content: value.trim() };
        setMessages(prev => [...prev, newMessage]);
        setIsLoading(true);
        setValue("");
        adjustHeight(true);

        try {
            const response = await fetch('/api/chat/chat-real', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: value.trim(),
                    sessionId: `session_${Date.now()}`,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to get response');
            }

            const data = await response.json();
            setMessages(prev => [...prev, { 
                role: "assistant", 
                content: data.message?.content || data.content || "I received your message but couldn't generate a proper response."
            }]);
        } catch (error) {
            console.error('Error:', error);
            setMessages(prev => [...prev, { role: "assistant", content: "I'm having trouble connecting right now. Please try again later." }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className="flex flex-col items-center w-full max-w-4xl mx-auto p-4 space-y-8 bg-[#111111] min-h-screen">
            {/* Home Button */}
            <div className="w-full flex justify-start">
                <Link
                    href="/"
                    className="flex items-center gap-2 text-gray-400 hover:text-[#8C1515] transition-colors text-sm"
                >
                    <Home className="w-4 h-4" />
                    Back to Home
                </Link>
            </div>

            <h1 className="text-4xl font-bold text-white">
                What can I help you analyze?
            </h1>

            {/* Messages */}
            {messages.length > 0 && (
                <div className="w-full max-w-3xl space-y-4">
                    {messages.map((message, index) => (
                        <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] p-4 rounded-lg ${
                                message.role === 'user' 
                                    ? 'bg-[#8C1515] text-white' 
                                    : 'bg-[#1a1a1a] border border-gray-700 text-gray-300'
                            }`}>
                                <p className="text-sm leading-relaxed">{message.content}</p>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="max-w-[80%] p-4 rounded-lg bg-[#1a1a1a] border border-gray-700">
                                <p className="text-gray-400">Thinking...</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="w-full">
                <div className="relative bg-[#1a1a1a] rounded-xl border border-gray-700">
                    <div className="overflow-y-auto">
                        <Textarea
                            ref={textareaRef}
                            value={value}
                            onChange={(e) => {
                                setValue(e.target.value);
                                adjustHeight();
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask SMeshLLM about air quality, sensor data, or upload your CSV files..."
                            className={cn(
                                "w-full px-4 py-3",
                                "resize-none",
                                "bg-transparent",
                                "border-none",
                                "text-white text-sm",
                                "focus:outline-none",
                                "focus-visible:ring-0 focus-visible:ring-offset-0",
                                "placeholder:text-gray-500 placeholder:text-sm",
                                "min-h-[60px]"
                            )}
                            style={{
                                overflow: "hidden",
                            }}
                        />
                    </div>

                    <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="group p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors flex items-center gap-1"
                            >
                                <Paperclip className="w-4 h-4 text-white" />
                                <span className="text-xs text-gray-400 hidden group-hover:inline transition-opacity">
                                    Attach
                                </span>
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="px-2 py-1 rounded-lg text-sm text-gray-400 transition-colors border border-dashed border-gray-600 hover:border-gray-500 hover:bg-[#2a2a2a] flex items-center justify-between gap-1"
                            >
                                <PlusIcon className="w-4 h-4" />
                                Project
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={!value.trim() || isLoading}
                                className={cn(
                                    "px-1.5 py-1.5 rounded-lg text-sm transition-colors border border-gray-600 hover:border-gray-500 hover:bg-[#2a2a2a] flex items-center justify-between gap-1",
                                    value.trim() && !isLoading
                                        ? "bg-[#8C1515] text-white border-[#8C1515] hover:bg-[#7A1212]"
                                        : "text-gray-400"
                                )}
                            >
                                <ArrowUpIcon
                                    className={cn(
                                        "w-4 h-4",
                                        value.trim() && !isLoading
                                            ? "text-white"
                                            : "text-gray-400"
                                    )}
                                />
                                <span className="sr-only">Send</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-center gap-3 mt-4">
                    <ActionButton
                        icon={<FileSpreadsheet className="w-4 h-4" />}
                        label="Upload CSV Data"
                    />
                    <ActionButton
                        icon={<BarChart3 className="w-4 h-4" />}
                        label="Analyze Air Quality"
                    />
                    <ActionButton
                        icon={<TrendingUp className="w-4 h-4" />}
                        label="Show Trends"
                    />
                    <ActionButton
                        icon={<MessageSquare className="w-4 h-4" />}
                        label="Ask about Sensors"
                    />
                </div>
            </div>
        </div>
    );
}

interface ActionButtonProps {
    icon: React.ReactNode;
    label: string;
}

function ActionButton({ icon, label }: ActionButtonProps) {
    return (
        <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] rounded-full border border-gray-700 text-gray-400 hover:text-white transition-colors"
        >
            {icon}
            <span className="text-xs">{label}</span>
        </button>
    );
} 