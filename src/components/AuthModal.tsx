import React, { useState } from "react";
import { X, User, Cloud, Shield, ArrowRight, AlertCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export const AuthModal: React.FC = () => {
  const { user, isAuthModalOpen, closeAuthModal, signIn, signUp, signOut, toggleCloudSync } =
    useAuth();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    const cleanName = name.trim();

    if (isSignUp) {
      if (!cleanName) {
        setError("Please enter your full name.");
        return;
      }

      if (!cleanEmail) {
        setError("Please enter your email address.");
        return;
      }

      const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
      if (!emailRegex.test(cleanEmail)) {
        setError("Please provide a valid email address.");
        return;
      }

      if (!password) {
        setError("Please enter a password.");
        return;
      }

      if (password.length < 8) {
        setError("Password must be at least 8 characters long.");
        return;
      }

      if (!confirmPassword) {
        setError("Please confirm your password.");
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwords do not match. Please verify both passwords.");
        return;
      }
    } else {
      if (!cleanEmail || !password) {
        setError("Please provide both your email and password.");
        return;
      }
    }

    setIsLoading(true);
    try {
      if (isSignUp) {
        const result = await signUp(
          cleanEmail,
          password,
          cleanName,
          confirmPassword
        );
        if (!result.success) {
          setError(result.error || "Failed to create account. Please check your details.");
        }
      } else {
        const result = await signIn(cleanEmail, password);
        if (!result.success) {
          setError(result.error || "Invalid email or password.");
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                {user.isGuest ? "Account & Cloud Sync" : "Your Account"}
              </h2>
              <div className="text-[11px] text-neutral-400">
                {user.isGuest ? "Optional synchronization across devices" : user.email}
              </div>
            </div>
          </div>
          <button
            onClick={closeAuthModal}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* If already signed in */}
        {!user.isGuest ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-[#1c212c] border border-neutral-200 dark:border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                    {user.name}
                  </div>
                  <div className="text-xs text-neutral-500">{user.email}</div>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-500/20">
                  Active Session
                </span>
              </div>

              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                  <Cloud className="w-3.5 h-3.5 text-blue-500" />
                  <span>Cloud Conversation Sync</span>
                </div>
                <input
                  type="checkbox"
                  checked={user.syncEnabled}
                  onChange={toggleCloudSync}
                  className="accent-blue-600 cursor-pointer w-4 h-4"
                />
              </div>
            </div>

            <button
              onClick={async () => {
                await signOut();
                closeAuthModal();
              }}
              className="w-full py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Sign Out to Guest Mode
            </button>
          </div>
        ) : (
          /* Guest Mode with Sign Up / In Form */
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-blue-500/5 border border-blue-500/15 flex items-start gap-2.5 text-xs text-blue-700 dark:text-blue-300">
              <Shield className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-500" />
              <span>
                <strong>Guest Mode Active:</strong> You can chat with RSR Nexora freely without
                logging in. Creating an account is completely optional and enables synchronized cloud backups.
              </span>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              {isSignUp && (
                <div>
                  <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                    Your Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex Miller"
                    className="w-full px-3 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-[#1c212c] border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-[#1c212c] border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Password (min 8 characters)
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-[#1c212c] border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              {isSignUp && (
                <div>
                  <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-[#1c212c] border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-2xs flex items-center justify-center gap-1.5 mt-2 cursor-pointer disabled:opacity-50"
              >
                <span>
                  {isLoading
                    ? isSignUp
                      ? "Creating Account..."
                      : "Signing In..."
                    : isSignUp
                    ? "Create Account"
                    : "Sign In"}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>

            <div className="flex items-center justify-between text-xs text-neutral-500 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                  setPassword("");
                  setConfirmPassword("");
                }}
                className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                {isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}
              </button>
              <button
                type="button"
                onClick={closeAuthModal}
                className="hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer"
              >
                Continue as Guest
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
