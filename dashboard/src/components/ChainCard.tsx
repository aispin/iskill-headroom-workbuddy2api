import { useT } from "../i18n";
import type { StatusPayload } from "../types";
import { Card, Dot } from "./ui";

const HUB_REPO_URL = "https://github.com/ardeyouxipianyi/workbuddy2api-hub";
const HEADROOM_REPO_URL = "https://github.com/headroomlabs-ai/headroom";

function Node({
  title,
  desc,
  state,
  href,
}: {
  title: string;
  desc: string;
  state: "on" | "off" | "idle";
  href?: string;
}) {
  return (
    <div className="flex-1 basis-40 rounded-lg border border-line bg-sunken px-3 py-2.5">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        {state !== "idle" && <Dot state={state} />}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand underline underline-offset-2 hover:no-underline"
          >
            {title}
          </a>
        ) : (
          title
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

  const pid = (v?: number | null) => (v ? t("chain.pid", { pid: v }) : "");

  return (
    <Card title={t("chain.title")}>
      <div className="flex flex-wrap items-stretch gap-2">
        <Node title={t("chain.client.title")} desc={t("chain.client.desc")} state="idle" />
        <div className="hidden items-center text-muted sm:flex">→</div>
        <Node
          title="Headroom"
          href={HEADROOM_REPO_URL}
          desc={t("chain.headroom.desc", { port: hr?.port ?? 8787, pid: pid(hr?.pid) })}
          state={hr?.listening ? "on" : "off"}
        />
        <div className="hidden items-center text-muted sm:flex">→</div>
        <Node
          title="workbuddy2api-hub"
          href={HUB_REPO_URL}
          desc={t("chain.hub.desc", { port: hub?.port ?? 8788, pid: pid(hub?.pid) })}
          state={hub?.listening ? "on" : "off"}
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
