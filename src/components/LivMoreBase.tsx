"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAccount, useConnect, useDisconnect, useWalletClient } from "wagmi";
import { EAS } from "@ethereum-attestation-service/eas-sdk";
import { ethers } from "ethers";
import { HybridSigner } from "@/lib/hybrid-signer";
import Image from "next/image";
import { protoMono } from "../styles/fonts";
import type { AppUser } from "@/types/user";
import ConnectDevice from "./ConnectDevice";
import Leaderboard from "./Leaderboard";
import Steps from "./Steps";
import OG from "./OG";

type TabId = "home" | "leaderboard" | "steps" | "og";

const EAS_CONTRACT = "0x4200000000000000000000000000000000000021";
const BASE_RPC = "https://mainnet.base.org";

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function getYesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getLast10DaysRange(): { from: string; to: string } {
  const to = getTodayUTC();
  const d = new Date(to + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 9);
  return { from: d.toISOString().slice(0, 10), to };
}

function formatDateDayWeekMonth(dateStr: string): string {
  const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T12:00:00Z"));
  const dayOfWeek = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const day = d.getUTCDate();
  const month = d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `${dayOfWeek} ${String(day).padStart(2, "0")} ${month}`;
}

function formatSteps(n: number | string): string {
  const num = typeof n === "string" ? parseInt(n, 10) : n;
  return Number.isNaN(num) ? "0" : num.toLocaleString("en-US");
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function hasSupportedDevice(provider: AppUser["provider"] | undefined): boolean {
  return provider === "garmin" || provider === "polar" || provider === "oura" || provider === "google";
}

export default function LivMoreBase() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();

  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [userLoadDone, setUserLoadDone] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [homeTab, setHomeTab] = useState<"activity" | "instructions">("activity");
  const [weeklySteps, setWeeklySteps] = useState<{ date: string; steps: number; attestation_hash: string | null }[]>([]);
  const [weeklyStepsLoading, setWeeklyStepsLoading] = useState(false);
  const [attestingDate, setAttestingDate] = useState<string | null>(null);

  // Onboarding — vincular FID existente
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [fidInput, setFidInput] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);

  const hasEnsuredUserRef = useRef(false);

  const refetchUser = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/user/wallet?address=${address}`);
      const data = await res.json();
      if (data.success && data.user) setAppUser(data.user);
    } catch (e) {
      console.error("[LivMoreBase] refetch user error:", e);
    }
  }, [address]);

  // Cargar o crear usuario cuando la wallet está conectada
  useEffect(() => {
    if (!isConnected || !address || hasEnsuredUserRef.current) return;
    hasEnsuredUserRef.current = true;

    const ensureUser = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/user/wallet?address=${address}`);
        const data = await res.json();

        if (data.success && data.user) {
          // Usuario existente — acceso directo
          setAppUser(data.user);
        } else {
          // Usuario nuevo — mostrar onboarding
          setShowOnboarding(true);
        }
      } catch (e) {
        console.error("[LivMoreBase] ensure user error:", e);
      } finally {
        setIsLoading(false);
        setUserLoadDone(true);
      }
    };

    ensureUser();
  }, [isConnected, address]);

  // Reset cuando desconecta wallet
  useEffect(() => {
    if (!isConnected) {
      setAppUser(null);
      setUserLoadDone(false);
      setIsLoading(false);
      setShowOnboarding(false);
      hasEnsuredUserRef.current = false;
    }
  }, [isConnected]);

  // Refetch user tras OAuth de dispositivo
  useEffect(() => {
    if (!isConnected || !address) return;
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("garmin") === "connected" ||
      params.get("polar") === "connected" ||
      params.get("oura") === "success"
    ) {
      refetchUser();
      const url = new URL(window.location.href);
      url.searchParams.delete("garmin");
      url.searchParams.delete("polar");
      url.searchParams.delete("oura");
      window.history.replaceState({}, "", url.pathname + (url.search || ""));
    }
  }, [isConnected, address, refetchUser]);

  // Cargar pasos
  useEffect(() => {
    if (!appUser?.id || !hasSupportedDevice(appUser.provider)) {
      setWeeklySteps([]);
      return;
    }
    const { from, to } = getLast10DaysRange();
    setWeeklyStepsLoading(true);
    const param = appUser.fid ? `fid=${appUser.fid}` : `userId=${appUser.id}`;
    fetch(`/api/steps/daily?${param}&from=${from}&to=${to}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.steps)) {
          setWeeklySteps(
            data.steps.map((s: { date: string; steps: number; attestation_hash?: string | null }) => ({
              date: s.date,
              steps: Number(s.steps) || 0,
              attestation_hash: s.attestation_hash ?? null,
            }))
          );
        } else {
          setWeeklySteps([]);
        }
      })
      .catch(() => setWeeklySteps([]))
      .finally(() => setWeeklyStepsLoading(false));
  }, [appUser?.id, appUser?.fid, appUser?.provider]);

  const handleAttest = useCallback(async (date: string) => {
    if (!appUser || attestingDate) return;
    setAttestingDate(date);
    try {
      // Obtener provider — walletClient si está disponible, window.ethereum como fallback
      let provider: ethers.BrowserProvider;
      if (walletClient) {
        provider = new ethers.BrowserProvider(walletClient.transport);
      } else if (typeof window !== "undefined" && window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum as ethers.Eip1193Provider);
      } else {
        console.error("[attest] no wallet provider available");
        setAttestingDate(null);
        return;
      }
  
      const signer = await provider.getSigner();
      const walletAddress = await signer.getAddress();
  
      const readProvider = new ethers.JsonRpcProvider(BASE_RPC);
      const hybridSigner = new HybridSigner(readProvider, signer);
  
      const signRes = await fetch("/api/attest/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: appUser.id, date, walletAddress }),
      });
      const signData = await signRes.json();
      if (!signData.ok) {
        console.error("[LivMoreBase] attest/sign error:", signData.error);
        return;
      }
  
      const { signature, message, attester, stepId } = signData;
  
      const eas = new EAS(EAS_CONTRACT);
      eas.connect(hybridSigner);
  
      const tx = await eas.attestByDelegation({
        schema: signData.schema,
        data: {
          recipient: message.recipient,
          expirationTime: BigInt(message.expirationTime),
          revocable: message.revocable,
          refUID: message.refUID,
          data: message.data,
          value: BigInt(message.value),
        },
        signature,
        attester,
        deadline: BigInt(message.deadline),
      });
  
      const attestationUID = await tx.wait();
  
      await fetch("/api/attest/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId, attestationUID }),
      });
  
      setWeeklySteps((prev) =>
        prev.map((s) =>
          s.date === date ? { ...s, attestation_hash: attestationUID } : s
        )
      );
    } catch (e) {
      console.error("[LivMoreBase] attest failed:", e);
    } finally {
      setAttestingDate(null);
    }
  }, [appUser, attestingDate, walletClient]);

  // Vincular FID existente
  const handleLinkFid = async () => {
    const fid = parseInt(fidInput, 10);
    if (!fid || !address) return;
    setLinkLoading(true);
    setLinkError(null);
    try {
      const res = await fetch("/api/user/wallet", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eth_address: address, fid }),
      });
      const data = await res.json();
      if (data.success) {
        setAppUser(data.user);
        setShowOnboarding(false);
      } else {
        setLinkError(data.error ?? "FID not found — check your number and try again");
      }
    } catch {
      setLinkError("Error linking account");
    } finally {
      setLinkLoading(false);
    }
  };

  // Crear usuario nuevo sin FID
  const handleCreateNew = async () => {
    if (!address) return;
    setLinkLoading(true);
    try {
      const res = await fetch("/api/user/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eth_address: address }),
      });
      const data = await res.json();
      if (data.success) {
        setAppUser(data.user);
        setShowOnboarding(false);
      }
    } catch (e) {
      console.error("[LivMoreBase] create user error:", e);
    } finally {
      setLinkLoading(false);
    }
  };

  const activityDates = (() => {
    const { from, to } = getLast10DaysRange();
    const dates: string[] = [];
    const d = new Date(from + "T12:00:00Z");
    const end = new Date(to + "T12:00:00Z");
    while (d <= end) {
      dates.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return dates;
  })();

  const stepsByDate = new Map(weeklySteps.map((s) => [s.date, s.steps]));
  const attestationByDate = new Map(weeklySteps.map((s) => [s.date, s.attestation_hash]));
  const displayName = appUser?.basename ?? appUser?.display_name ?? (address ? truncateAddress(address) : "");

  // ── Pantalla: wallet no conectada ──
  if (!isConnected) {
    return (
      <div className={`min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 gap-6 ${protoMono.className}`}>
        <Image src="/livMore_w.png" alt="LivMore" width={80} height={80} priority />
        <div className="text-center">
          <h1 className={`text-3xl font-bold ${protoMono.className}`}>LivMore</h1>
          <p className={`text-gray-400 text-sm mt-2 ${protoMono.className}`}>
            Tracking your healthy habits, one step at a time 👟
          </p>
        </div>
        <div className="w-full max-w-xs space-y-3">
          {connectors.map((connector) => (
            <button
              key={connector.id}
              type="button"
              onClick={() => connect({ connector })}
              className={`w-full py-3 px-4 rounded-lg bg-[#0052ff] text-white font-semibold text-sm uppercase tracking-wider hover:bg-[#0041cc] transition-colors ${protoMono.className}`}
            >
              Connect Wallet
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Pantalla: cargando ──
  if (isLoading) {
    return (
      <div className={`min-h-screen bg-black text-white flex items-center justify-center ${protoMono.className}`}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-t-2 border-white rounded-full animate-spin" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // ── Pantalla: onboarding usuario nuevo ──
  if (showOnboarding) {
    return (
      <div className={`min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 gap-6 ${protoMono.className}`}>
        <Image src="/livMore_w.png" alt="LivMore" width={64} height={64} priority />
        <div className="text-center">
          <h1 className={`text-2xl font-bold ${protoMono.className}`}>Welcome to LivMore</h1>
          <p className={`text-gray-400 text-sm mt-1 ${protoMono.className}`}>
            {address ? truncateAddress(address) : ""}
          </p>
        </div>

        <div className="w-full max-w-xs space-y-4">
          {/* Opción 1: vincular cuenta de Farcaster */}
          <div className="p-4 rounded-xl border border-gray-700 bg-gray-900/50 space-y-3">
            <p className={`text-white text-sm font-semibold ${protoMono.className}`}>
              Already use LivMore on Farcaster?
            </p>
            <p className={`text-gray-400 text-xs ${protoMono.className}`}>
              Enter your FID to import your history and stats.
            </p>
            <input
              type="number"
              value={fidInput}
              onChange={(e) => setFidInput(e.target.value)}
              placeholder="Your FID (e.g. 348971)"
              className={`w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#0052ff] ${protoMono.className}`}
            />
            {linkError && <p className="text-red-400 text-xs">{linkError}</p>}
            <button
              type="button"
              onClick={handleLinkFid}
              disabled={linkLoading || !fidInput}
              className={`w-full py-2 rounded-lg bg-[#0052ff] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#0041cc] transition-colors ${protoMono.className}`}
            >
              {linkLoading ? "Linking…" : "Link Farcaster account"}
            </button>
          </div>

          {/* Opción 2: crear usuario nuevo */}
          <button
            type="button"
            onClick={handleCreateNew}
            disabled={linkLoading}
            className={`w-full py-3 rounded-lg bg-transparent border border-gray-600 text-gray-300 text-sm hover:border-gray-400 hover:text-white transition-colors disabled:opacity-50 ${protoMono.className}`}
          >
            I&apos;m new — create my account
          </button>
        </div>

        <button
          type="button"
          onClick={() => disconnect()}
          className={`text-gray-600 text-xs hover:text-gray-400 ${protoMono.className}`}
        >
          Disconnect wallet
        </button>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-black text-white flex flex-col ${protoMono.className}`}>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-3 py-2 bg-black/95 backdrop-blur-sm border-b border-gray-800">
        <div className="flex items-center gap-2 min-w-0">
          <Image src="/livMore_w.png" alt="" width={32} height={32} className="shrink-0" priority />
          <span className={`text-lg font-bold truncate ${protoMono.className}`}>LivMore</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 pl-2 pr-3 py-1 rounded-full bg-gray-900 border border-gray-700">
            {/* Badge Base */}
            <svg width="14" height="14" viewBox="0 0 1280 1280" fill="none">
              <path
                d="M0,101.12c0-34.64,0-51.95,6.53-65.28,6.25-12.76,16.56-23.07,29.32-29.32C49.17,0,66.48,0,101.12,0h1077.76c34.63,0,51.96,0,65.28,6.53,12.75,6.25,23.06,16.56,29.32,29.32,6.52,13.32,6.52,30.64,6.52,65.28v1077.76c0,34.63,0,51.96-6.52,65.28-6.26,12.75-16.57,23.06-29.32,29.32-13.32,6.52-30.65,6.52-65.28,6.52H101.12c-34.64,0-51.95,0-65.28-6.52-12.76-6.26-23.07-16.57-29.32-29.32-6.53-13.32-6.53-30.65-6.53-65.28V101.12Z"
                fill="#0052ff"
              />
            </svg>
            <span className={`text-white text-sm truncate max-w-[120px] ${protoMono.className}`}>
              {displayName}
            </span>
            {appUser?.og && <span className="text-amber-400 text-xs" title="OG">◆</span>}
          </div>
          <button
            type="button"
            onClick={() => disconnect()}
            className="text-gray-500 text-xs hover:text-gray-300 transition-colors"
            title="Disconnect"
          >
            ✕
          </button>
        </div>
      </header>

      {/* Tab content */}
      {activeTab === "leaderboard" && <Leaderboard />}
      {activeTab === "steps" && <Steps currentUserFid={appUser?.fid ?? undefined} />}
      {activeTab === "og" && <OG />}

      {activeTab === "home" && hasSupportedDevice(appUser?.provider) ? (
        <main className={`flex-1 flex flex-col p-4 pt-14 pb-16 overflow-auto ${protoMono.className}`}>
          <h1 className="text-xl text-center font-semibold text-white mb-1">One Step at a Time</h1>

          <div className="flex border-b border-gray-700 mb-4">
            <button type="button" onClick={() => setHomeTab("activity")}
              className={`flex-1 py-3 text-sm uppercase tracking-wider transition-colors ${homeTab === "activity" ? "text-white border-b-2 border-[#ff8800]" : "text-gray-500 border-b-2 border-transparent hover:text-gray-300"}`}>
              Latest Activity
            </button>
            <button type="button" onClick={() => setHomeTab("instructions")}
              className={`flex-1 py-3 text-sm uppercase tracking-wider transition-colors ${homeTab === "instructions" ? "text-white border-b-2 border-[#ff8800]" : "text-gray-500 border-b-2 border-transparent hover:text-gray-300"}`}>
              How LivMore works!
            </button>
          </div>

          {homeTab === "activity" && (
            <section className="w-full max-w-sm mx-auto">
              {weeklyStepsLoading ? (
                <p className="text-gray-500 text-sm text-center py-8">Loading…</p>
              ) : (
                <div className={`overflow-hidden rounded-lg border border-gray-700 ${protoMono.className}`}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-white border-b border-gray-700">
                        <th className="text-left py-2 px-3 font-semibold">Date</th>
                        <th className="text-right py-2 px-3 font-semibold">Steps</th>
                        <th className="text-center py-2 px-3 font-semibold">Attestation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...activityDates].reverse().map((date) => {
                        const steps = stepsByDate.get(date);
                        const attestationHash = attestationByDate.get(date);
                        const isAttesting = attestingDate === date;
                        const today = getTodayUTC();
                        const yesterday = getYesterdayUTC();
                        const todaySteps = stepsByDate.get(today) ?? 0;
                        const canAttestYesterday = date === yesterday && todaySteps > 0;
                        const canAttestOlder = date < yesterday;
                        const canAttest = steps !== undefined && steps > 0 && !attestationHash && date < today && (canAttestYesterday || canAttestOlder);
                        return (
                          <tr key={date} className="border-b border-gray-800 last:border-0">
                            <td className="py-2 px-3 text-gray-300">{formatDateDayWeekMonth(date)}</td>
                            <td className="py-2 px-3 text-right text-white font-medium">
                              {steps !== undefined ? formatSteps(steps) : "—"}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {attestationHash ? (
                                <a href={`https://base.easscan.org/attestation/view/${attestationHash}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-green-500 hover:text-green-400 text-xs">
                                  <span>✓</span><span className="underline">View</span>
                                </a>
                              ) : isAttesting ? (
                                <span className="inline-flex items-center gap-1 text-yellow-400 text-xs">
                                  <span className="w-3 h-3 border-t-2 border-yellow-400 rounded-full animate-spin" />
                                  Attesting…
                                </span>
                              ) : canAttest ? (
                                <button type="button" onClick={() => handleAttest(date)}
                                  className={`text-[#ff8800] hover:text-white text-xs underline ${protoMono.className}`}>
                                  Attest
                                </button>
                              ) : (
                                <span className="text-gray-600 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-gray-500 text-xs text-center mt-2 tracking-wide">
                Only attested days count toward the weekly leaderboard.
              </p>
              {!weeklyStepsLoading &&
                (stepsByDate.get(getYesterdayUTC()) ?? 0) > 0 &&
                !attestationByDate.get(getYesterdayUTC()) &&
                (stepsByDate.get(getTodayUTC()) ?? 0) === 0 && (
                  <p className="text-gray-500 text-xs text-center mt-2 tracking-wide">
                    Sync your wearable to see today&apos;s steps and enable Attest for yesterday.
                  </p>
                )}
            </section>
          )}

          {homeTab === "instructions" && (
            <section className="w-full max-w-sm mx-auto space-y-3">
              <div className={`text-sm text-white space-y-3 ${protoMono.className}`}>
                <p>Connect your wearable and start tracking your daily steps. Each competition week runs from <span className="font-semibold">Monday to Sunday.</span></p>
                <p><span className="font-semibold">Attestations are required.</span> Only days you manually attest count toward the weekly leaderboard. Each day closes at <span className="font-semibold">6:00 PM CST (UTC-6)</span> — you can attest any previous day after it has closed.</p>
                <p><span className="font-semibold">Weekly prizes</span> are distributed every week from 100% of tx fees collected in $STEPS tokens:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>60% split equally among the <span className="font-semibold">Top 5</span> users with the most attested steps</li>
                  <li>20% to the <span className="font-semibold">NFT holder</span> with the most attested steps</li>
                  <li>20% to the <span className="font-semibold">OG minter</span> with the most attested steps</li>
                </ul>
                <p>A single user can win in multiple categories simultaneously.</p>
                <p><span className="font-semibold">OG status</span> is permanently assigned to the 343 original minters and never changes.</p>
              </div>
            </section>
          )}
        </main>
      ) : activeTab === "home" && appUser && !hasSupportedDevice(appUser.provider) ? (
        <div className="flex-1 flex flex-col pt-14 pb-16 overflow-auto">
          <ConnectDevice user={appUser} onProviderSet={refetchUser} />
        </div>
      ) : activeTab === "home" && !userLoadDone ? (
        <main className="flex-1 flex flex-col items-center justify-center p-2 pt-14 pb-16 gap-2 overflow-auto">
          <div className="w-8 h-8 border-t-2 border-white rounded-full animate-spin" />
          <p className={protoMono.className}>Loading your account…</p>
        </main>
      ) : null}

      {/* Bottom nav */}
      <nav className={`fixed bottom-0 left-0 right-0 z-50 border-t border-gray-800 bg-black/95 backdrop-blur-sm ${protoMono.className}`}>
        <div className="grid grid-cols-4">
          <button type="button" onClick={() => setActiveTab("home")}
            className={`py-3 text-center transition-colors ${activeTab === "home" ? "text-white" : "text-gray-400 hover:text-gray-300"}`}>
            🏠<br />HOME
          </button>
          <button type="button" onClick={() => setActiveTab("leaderboard")}
            className={`py-3 text-center transition-colors ${activeTab === "leaderboard" ? "text-white" : "text-gray-400 hover:text-gray-300"}`}>
            📈<br />RANK
          </button>
          <button type="button" onClick={() => setActiveTab("steps")}
            className={`py-3 text-center transition-colors ${activeTab === "steps" ? "text-white" : "text-gray-400 hover:text-gray-300"}`}>
            👟<br />$STEPS
          </button>
          <button type="button" onClick={() => setActiveTab("og")}
            className={`py-3 text-center transition-colors ${activeTab === "og" ? "text-white" : "text-gray-400 hover:text-gray-300"}`}>
            💎<br />OG
          </button>
        </div>
      </nav>
    </div>
  );
}