import { useT } from "../i18n";
import type { StatusPayload } from "../types";
import { Card, Dot } from "./ui";

function Node({
  title,
  desc,
  state,
  ver,
  verWarn,
}: {
  title: string;
  desc: string;
  state: "on" | "off" | "idle";
  ver?: string;
  verWarn?: boolean;
}) {
  return (
    <div className="flex-1 basis-40 rounded-lg border border-line bg-sunken px-3 py-2.5">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        {state !== "idle" && <Dot state={state} />}
        {title}
        {ver && (
          <span
            className={`ml-auto whitespace-nowrap font-mono text-[11px] font-normal ${
              verWarn ? "text-warn-ink" : "text-muted"
            }`}
          >
            {ver}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[12px] text-ink-soft">{desc}</div>
    </div>
  );
}

export function ChainCard({ data }: { data: StatusPayload | null }) {
  const t = useT();
  const hub = data?.services.hub;
  const hr = data?.services.headroom;
  const health = data?.hub.health ?? {};
  const ver = data?.versions;

  const hubVer = ver?.hub.running
    ? t("chain.hub.ver", { ver: ver.hub.running, pin: ver.hub.pin })
    : ver?.hub.pin
      ? t("chain.hub.pinOnly", { pin: ver.hub.pin })
      : "";
  const hrLocked = ver?.headroom.locked ?? "";
  const hrVer = ver?.headroom.running
    ? t("chain.headroom.ver", { ver: ver.headroom.running, locked: hrLocked })
    : hrLocked
      ? t("chain.headroom.lockOnly", { locked: hrLocked })
      : "";
  const hrMismatch = !!(
    ver?.headroom.running &&
    hrLocked &&
    ver.headroom.running !== hrLocked
  );

  const pid = (v?: number | null) => (v ? t("chain.pid", { pid: v }) : "");

  return (
    <Card title={t("chain.title")}>
      <div className="flex flex-wrap items-stretch gap-2">
        <Node title={t("chain.client.title")} desc={t("chain.client.desc")} state="idle" />
        <div className="hidden items-center text-muted sm:flex">→</div>
        <Node
          title="Headroom"
          desc={t("chain.headroom.desc", { port: hr?.port ?? 8787, pid: pid(hr?.pid) })}
          state={hr?.listening ? "on" : "off"}
          ver={hrVer}
          verWarn={hrMismatch}
        />
        <div className="hidden items-center text-muted sm:flex">→</div>
        <Node
          title="workbuddy2api-hub"
          desc={t("chain.hub.desc", { port: hub?.port ?? 8788, pid: pid(hub?.pid) })}
          state={hub?.listening ? "on" : "off"}
          ver={hubVer}
        />
        <div className="hidden items-center text-muted sm:flex">→</div>
        <Node
          title={t("chain.model.title")}
          desc={
            health.realm
              ? t("chain.model.desc", {
                  realm:
                    health.realm === "intl"
                      ? t("common.realm.intl")
                      : health.realm === "cn"
                        ? t("common.realm.cn")
                        : health.realm,
                  domain: health.domain ?? "—",
                })
              : t("chain.model.default")
          }
          state="idle"
        />
      </div>
    </Card>
  );
}
