/**
 * ════ THE CIRCLE TAB — the container (2026-09-29) ════
 *
 * `CrewView` draws; this reads `state/stores/circleStore` and does the five acts: invite (creating
 * the circle on the first invite, so there is no separate "create" step to understand), join by
 * code, cheer, remind, leave. It also carries the sharing that lived on the old Together screen —
 * the story cards and the week to send — because the social home is this tab now.
 *
 * ⛔ WHAT GOES OUT: a cheer is a first name and a moment (the worker keeps nothing about the workout);
 * a reminder and an invite are HER messages, sent from HER WhatsApp — the app never messages anybody
 * on its own. See `domain/circle` for the allow-list her week travels under.
 */

//

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { CrewView, type CrewMemberView } from './Crew';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { loadWeekPlan } from '@/data/local/weekPlan';
import { sessionCardFromHistory, weekCardFromHistory, type ShareSessionCard, type ShareWeekCard } from '@/domain/shareCard';
import { circleInviteLink, circleMembersView, latestCheer } from '@/domain/circle';
import { currentWeekOpen } from '@/domain/weekCadence';
import { circleCheer, circleCreate, circleJoin, circleLeave } from '@/platform/circleClient';
import { shareViaWhatsApp } from '@/platform/share';
import { track } from '@/platform/telemetry';
import { refreshCircle, takePendingCircleCode, useCircle } from '@/state/stores/circleStore';
import type { HomeTabsParamList, MainParamList } from '@/app/navigation';

type Props = CompositeScreenProps<BottomTabScreenProps<HomeTabsParamList, 'Crew'>, NativeStackScreenProps<MainParamList>>;

export function CrewScreen({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const snap = useCircle();
  const [notice, setNotice] = useState<string | null>(null);
  /* A cheer shows as sent the moment she presses it; the next read confirms it from the worker. */
  const [cheeredNow, setCheeredNow] = useState<ReadonlySet<string>>(new Set());
  const [sessionCard, setSessionCard] = useState<ShareSessionCard | null>(null);
  const [weekCard, setWeekCard] = useState<ShareWeekCard | null>(null);
  const [hasPlan, setHasPlan] = useState(false);

  /* Every visit reads the circle again — it is the one screen whose whole point is what changed. A
     code that arrived by link before she could use it is spent here, once. */
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const pending = takePendingCircleCode();
        if (pending) {
          const ok = await circleJoin(pending);
          void track('circle_joined', { via: 'link', ok });
        }
        await refreshCircle();
      })();
    }, []),
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [history, plan] = await Promise.all([db.loadHistory().catch(() => []), loadWeekPlan().catch(() => null)]);
      if (!alive) return;
      const units = app.profile?.units ?? 'kg';
      const sex = app.profile?.sex === 'male' ? ('male' as const) : ('female' as const);
      setSessionCard(sessionCardFromHistory(history, units, app.profile?.weightKg, sex));
      setWeekCard(weekCardFromHistory(history, currentWeekOpen(Date.now()), app.profile?.weightKg, units, app.profile?.memberSince));
      setHasPlan(plan != null);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const members: CrewMemberView[] | null = useMemo(() => {
    if (!snap.circle) return null;
    const now = Date.now();
    return circleMembersView(snap.circle, { nowMs: now, weekOpenMs: currentWeekOpen(now), myName: app.profile?.name }).map((m) => ({
      ...m,
      cheered: m.cheered || (m.id != null && cheeredNow.has(m.id)),
    }));
  }, [snap.circle, app.profile?.name, cheeredNow]);

  const cheer = latestCheer(snap.circle);

  const invite = useCallback(async () => {
    setNotice(null);
    let code = snap.circle?.code ?? null;
    if (!code) {
      code = await circleCreate();
      if (code) void refreshCircle();
    }
    if (!code) {
      setNotice(t('crew.unavailable'));
      return;
    }
    const via = await shareViaWhatsApp(t('crew.inviteMessage', { link: circleInviteLink(code), code }));
    void track('circle_invited', { via });
  }, [snap.circle?.code, t]);

  return (
    <CrewView
      members={members}
      streakWeeks={snap.circle?.streak ?? 0}
      cheer={cheer ? t('crew.cheerFrom', { name: cheer.from }) : null}
      code={snap.circle?.code ?? null}
      notice={notice}
      onCheer={(m) => {
        if (!m.id) return;
        const id = m.id;
        setCheeredNow((s) => new Set(s).add(id));
        void circleCheer(id).then((ok) => {
          void track('circle_cheered', { ok });
          if (ok) {
            void refreshCircle();
            return;
          }
          /* It did not go — "sent" would be a lie. The button comes back, and the line says why. */
          setCheeredNow((s) => {
            const next = new Set(s);
            next.delete(id);
            return next;
          });
          setNotice(t('crew.unavailable'));
        });
      }}
      onNudge={(m) => {
        void shareViaWhatsApp(t('crew.nudgeMessage', { name: m.name })).then((via) => void track('circle_nudged', { via }));
      }}
      onInvite={() => void invite()}
      onJoin={async (code) => {
        setNotice(null);
        const ok = await circleJoin(code);
        void track('circle_joined', { via: 'code', ok });
        if (ok) await refreshCircle();
        return ok;
      }}
      onLeave={
        snap.circle
          ? () => {
              void circleLeave().then(() => refreshCircle());
            }
          : undefined
      }
      onShareSession={sessionCard ? () => navigation.navigate('ShareCardModal', { card: sessionCard, ...(weekCard ? { alternates: [weekCard] } : {}) }) : undefined}
      onShareWeek={weekCard ? () => navigation.navigate('ShareCardModal', { card: weekCard, ...(sessionCard ? { alternates: [sessionCard] } : {}) }) : undefined}
      onSendPlan={hasPlan ? () => navigation.navigate('SharePlan') : undefined}
    />
  );
}
