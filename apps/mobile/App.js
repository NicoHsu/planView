import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Pressable as NativePressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  History,
  Pause,
  Play,
  Plus,
  Square,
  TimerReset
} from "lucide-react-native";
import {
  aggregateTags,
  buildDailySummary,
  buildInsights,
  formatRemaining,
  getRemainingMs,
  getElapsedMs,
} from "@planview/core";
import { initStorage } from "./src/storage";
import * as storage from "./src/storage";
import { createFocusService } from "./src/focus-service";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

const DURATIONS = [15, 25, 45, 60];
const INTENTIONS = ["完成", "推進", "整理", "學習"];
const REASONS = [
  ["underestimated", "低估時間"],
  ["interrupted", "被打斷"],
  ["unclear_next_step", "下一步不清楚"],
  ["avoided", "抗拒/不想做"],
  ["urgent_insert", "臨時插入"],
  ["other", "其他"]
];

function Pressable({ accessibilityRole = "button", ...props }) {
  return <NativePressable accessibilityRole={accessibilityRole} {...props} />;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notificationWarning, setNotificationWarning] = useState("");
  const actionLock = useRef(false);
  const service = useRef(null);
  if (!service.current) {
    service.current = createFocusService({ storage, notifications: Notifications, onWarning: setNotificationWarning });
  }
  const [tab, setTab] = useState("today");
  const [tasks, setTasks] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [remainingLabel, setRemainingLabel] = useState("00:00");
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showReflect, setShowReflect] = useState(false);
  const [isSubmittingReflection, setIsSubmittingReflection] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTags, setDraftTags] = useState("work");
  const [draftDuration, setDraftDuration] = useState(25);
  const [draftIntention, setDraftIntention] = useState("推進");
  const [outcome, setOutcome] = useState("partial");
  const [reason, setReason] = useState("");
  const [nextAction, setNextAction] = useState("continue");
  const [note, setNote] = useState("");

  const todaySummary = useMemo(() => buildDailySummary(history), [history]);
  const insights = useMemo(() => buildInsights(history), [history]);
  const tagSummary = useMemo(() => aggregateTags(history), [history]);
  const nextTask = tasks[0] || null;

  const applySnapshot = useCallback(({ history: nextHistory, tasks: nextTasks, session: storedSession }) => {
    setHistory(nextHistory);
    setTasks(nextTasks);
    setActiveSession(storedSession);
    if (storedSession?.stoppedAt) {
      setShowReflect(true);
      setTab("focus");
    }
  }, []);

  const reload = useCallback(async () => {
    applySnapshot(await service.current.reload());
  }, [applySnapshot]);

  async function boot() {
    try {
      setLoadError("");
      await initStorage();
      await reload();
      setReady(true);
    } catch {
      setLoadError("無法讀取本機資料，請重試。既有資料會保留。");
    }
  }

  useEffect(() => {
    boot();
  }, [reload]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && ready) {
        reload().catch(() => Alert.alert("讀取失敗", "請稍後再試，資料仍保存在裝置上。"));
      }
    });
    return () => subscription.remove();
  }, [reload, ready]);

  useEffect(() => {
    if (!activeSession) {
      setRemainingLabel("00:00");
      return undefined;
    }

    function tick() {
      const remaining = getRemainingMs(activeSession);
      setRemainingLabel(formatRemaining(remaining));
      if (!activeSession.stoppedAt && activeSession.status !== "paused" && remaining <= 0) {
        reload().catch(() => setLoadError("無法儲存本輪結束狀態，請重試。"));
      }
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeSession, reload]);

  async function addTask() {
    await runAction(async () => {
      applySnapshot(await service.current.addTask({
        title: draftTitle, tags: draftTags, duration: draftDuration, intention: draftIntention
      }));
      setDraftTitle("");
      setShowAddSheet(false);
    });
  }

  async function runAction(action) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      Alert.alert("未能完成操作", error.message || "請稍後重試。");
      await reload().catch(() => {});
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  async function startFocus(task = nextTask, duration) {
    if (activeSession) { setTab("focus"); return; }
    if (!task) {
      setShowAddSheet(true);
      return;
    }
    await runAction(async () => {
      setNotificationWarning("");
      applySnapshot(await service.current.start(task, duration));
      setTab("focus");
    });
  }

  async function togglePause() {
    await runAction(async () => applySnapshot(await service.current.togglePause()));
  }

  async function openReflection() {
    await runAction(async () => applySnapshot(await service.current.reflect()));
  }

  async function endEarly() {
    if (!activeSession) return;
    Alert.alert("結束這輪？", "現在會進入回報，方便保留中斷原因。", [
      { text: "取消", style: "cancel" },
      {
        text: "回報進度",
        onPress: openReflection
      }
    ]);
  }

  async function submitReflection() {
    if (!activeSession || isSubmittingReflection) return;
    if (outcome !== "done" && !reason) {
      Alert.alert("請選擇主要原因", "這會用來校準之後的預估，不然分析會失真。");
      return;
    }

    await runAction(async () => {
      setIsSubmittingReflection(true);
      try {
        applySnapshot(await service.current.complete(activeSession.id, {
          status: outcome, reason, nextAction, reflection: note
        }));
        setShowReflect(false);
        setOutcome("partial");
        setReason("");
        setNextAction("continue");
        setNote("");
        setTab("today");
      } finally {
        setIsSubmittingReflection(false);
      }
    });
  }

  if (!ready) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.center}>
          <Text style={styles.loading}>PlanView</Text>
          {loadError ? <>
            <Text accessibilityRole="alert" style={styles.note}>{loadError}</Text>
            <Pressable style={styles.primaryButton} onPress={boot}><Text style={styles.primaryText}>重試</Text></Pressable>
          </> : null}
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.shell}>
        <StatusBar style="dark" />
        {notificationWarning ? <Text accessibilityRole="alert" style={styles.notificationWarning}>{notificationWarning}</Text> : null}
        {tab === "today" && (
          <TodayScreen
            summary={todaySummary}
            insights={insights}
            tasks={tasks}
            nextTask={nextTask}
            onAdd={() => setShowAddSheet(true)}
            onStart={startFocus}
            onSelectDuration={async (minutes) => {
              if (!nextTask) {
                setDraftDuration(minutes);
                setShowAddSheet(true);
                return;
              }
              await startFocus(nextTask, minutes);
            }}
          />
        )}
        {tab === "focus" && (
          <FocusScreen
            session={activeSession}
            remainingLabel={remainingLabel}
            onEnd={endEarly}
            onReflect={openReflection}
            onTogglePause={togglePause}
            busy={busy}
            onBack={() => setTab("today")}
          />
        )}
        {tab === "history" && <HistoryScreen history={history} tagSummary={tagSummary} insights={insights} />}
        <TabBar tab={tab} setTab={setTab} hasActiveSession={Boolean(activeSession)} />
        <AddTaskSheet
          visible={showAddSheet}
          title={draftTitle}
          tags={draftTags}
          duration={draftDuration}
          intention={draftIntention}
          setTitle={setDraftTitle}
          setTags={setDraftTags}
          setDuration={setDraftDuration}
          setIntention={setDraftIntention}
          onClose={() => setShowAddSheet(false)}
          onSubmit={addTask}
          busy={busy}
        />
        <ReflectSheet
          visible={showReflect}
          session={activeSession}
          outcome={outcome}
          reason={reason}
          nextAction={nextAction}
          note={note}
          submitting={isSubmittingReflection}
          setOutcome={setOutcome}
          setReason={setReason}
          setNextAction={setNextAction}
          setNote={setNote}
          onSubmit={submitReflection}
          onClose={() => {}}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function TodayScreen({ summary, insights, tasks, nextTask, onAdd, onStart, onSelectDuration }) {
  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.kicker}>Today</Text>
          <Text style={styles.title}>{summary.totalMinutes ? `${summary.totalMinutes}m focused` : "Plan the next block"}</Text>
        </View>
        <IconButton icon={Plus} label="新增" onPress={onAdd} />
      </View>

      <View style={styles.nextPanel}>
        <Text style={styles.sectionLabel}>Next Up</Text>
        {nextTask ? (
          <>
            <Text style={styles.nextTitle}>{nextTask.title}</Text>
            <TagLine tags={nextTask.tags} minutes={nextTask.estimateMinutes} />
            <Pressable style={styles.primaryButton} onPress={() => onStart(nextTask)}>
              <Play size={20} color="#fff" />
              <Text style={styles.primaryText}>開始 {nextTask.estimateMinutes} 分鐘</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.nextTitle}>先放一件真正要推進的事</Text>
            <Text style={styles.muted}>只需要任務名、時間與 tags，其他留到回報時再說。</Text>
            <Pressable style={styles.primaryButton} onPress={onAdd}>
              <Plus size={20} color="#fff" />
              <Text style={styles.primaryText}>快速新增</Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.chipRow}>
        {DURATIONS.map((minutes) => (
          <Pressable key={minutes} style={styles.chip} onPress={() => onSelectDuration(minutes)}>
            <Clock3 size={15} color="#28405f" />
            <Text style={styles.chipText}>{minutes}m</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.insightPanel}>
        <BarChart3 size={18} color="#1f6f61" />
        <Text style={styles.insightText}>{insights.headline}</Text>
      </View>

      <Text style={styles.sectionTitle}>今日任務池</Text>
      {tasks.map((task) => (
        <Pressable key={task.id} style={styles.taskCard} onPress={() => onStart(task)}>
          <View style={styles.taskIcon}>
            <TimerReset size={18} color="#28405f" />
          </View>
          <View style={styles.taskBody}>
            <Text style={styles.taskTitle}>{task.title}</Text>
            <TagLine tags={task.tags} minutes={task.estimateMinutes} />
          </View>
          <Play size={18} color="#28405f" />
        </Pressable>
      ))}
    </ScrollView>
  );
}

function FocusScreen({ session, remainingLabel, onEnd, onReflect, onTogglePause, onBack, busy }) {
  const todo = session?.todos?.[0];

  if (!session || !todo) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>沒有進行中的 timebox</Text>
        <Pressable style={styles.primaryButton} onPress={onBack}><Text style={styles.primaryText}>回到今日任務</Text></Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#18212f" }} contentContainerStyle={styles.focusScreen}>
      <Text style={styles.focusKicker}>{session.intention}</Text>
      <Text style={styles.focusTitle}>{todo.title}</Text>
      <TagLine tags={todo.tags} minutes={session.durationMinutes} dark />
      <Text style={styles.timer} accessibilityLabel={`剩餘時間 ${remainingLabel}`} adjustsFontSizeToFit numberOfLines={1}>{remainingLabel}</Text>
      <View style={styles.focusActions}>
        <Pressable style={styles.secondaryDarkButton} onPress={onTogglePause} disabled={busy || Boolean(session.stoppedAt)}>
          {session.status === "paused" ? <Play size={18} color="#f7f3ec" /> : <Pause size={18} color="#f7f3ec" />}
          <Text style={styles.secondaryDarkText}>{session.status === "paused" ? "繼續" : "暫停"}</Text>
        </Pressable>
        <Pressable style={styles.secondaryDarkButton} onPress={onEnd} disabled={busy}>
          <Square size={18} color="#f7f3ec" />
          <Text style={styles.secondaryDarkText}>結束</Text>
        </Pressable>
        <Pressable style={styles.lightButton} onPress={onReflect} disabled={busy}>
          <CheckCircle2 size={18} color="#18212f" />
          <Text style={styles.lightButtonText}>回報</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function HistoryScreen({ history, tagSummary, insights }) {
  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.kicker}>History</Text>
      <Text style={styles.title}>Review the pattern</Text>
      <View style={styles.insightPanel}>
        <BarChart3 size={18} color="#1f6f61" />
        <Text style={styles.insightText}>{insights.headline}</Text>
      </View>

      <Text style={styles.sectionTitle}>Tags</Text>
      {tagSummary.length === 0 ? (
        <Text style={styles.muted}>完成幾輪後會出現 tag 完成率與預估偏差。</Text>
      ) : (
        tagSummary.map((tag) => (
          <View key={tag.tag} style={styles.statCard}>
            <Text style={styles.statTitle}>#{tag.tag}</Text>
            <Text style={styles.muted}>
              {tag.actualMinutes}m actual · {tag.completionRate}% done · {tag.estimateDeltaMinutes >= 0 ? "+" : ""}
              {tag.estimateDeltaMinutes}m vs plan
            </Text>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Timeline</Text>
      {history.length === 0 ? (
        <View style={styles.recordCard}>
          <Text style={styles.taskTitle}>還沒有回顧紀錄</Text>
          <Text style={styles.muted}>完成第一輪後，這裡會列出任務、結果、原因與預估偏差。</Text>
        </View>
      ) : (
        history.map((record) => (
          <View key={record.sessionId} style={styles.recordCard}>
            <Text style={styles.taskTitle}>{record.items?.[0]?.title || "Session"}</Text>
            <Text style={styles.muted}>
              預估 {record.durationMinutes}m · 實際 {record.actualMinutes ?? record.durationMinutes}m · {record.outcome} · {new Date(record.endedAt).toLocaleString()}
            </Text>
            {record.reflection ? <Text style={styles.note}>{record.reflection}</Text> : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function AddTaskSheet(props) {
  return (
    <BottomSheet visible={props.visible} onClose={props.onClose}>
      <Text style={styles.sheetTitle}>快速新增</Text>
      <TextInput
        style={styles.input}
        value={props.title}
        onChangeText={props.setTitle}
        placeholder="接下來要推進什麼？"
        accessibilityLabel="任務名稱"
        autoFocus
      />
      <TextInput accessibilityLabel="任務標籤，以逗號分隔" style={styles.input} value={props.tags} onChangeText={props.setTags} placeholder="tags，例如 code, spec" />
      <Text style={styles.sheetLabel}>預估時間</Text>
      <View style={styles.chipRow}>
        {DURATIONS.map((minutes) => (
          <Pressable
            key={minutes}
            style={[styles.chip, props.duration === minutes && styles.chipSelected]}
            onPress={() => props.setDuration(minutes)}
            accessibilityState={{ selected: props.duration === minutes }}
          >
            <Text style={styles.chipText}>{minutes}m</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.sheetLabel}>意圖</Text>
      <View style={styles.chipRow}>
        {INTENTIONS.map((intention) => (
          <Pressable
            key={intention}
            style={[styles.chip, props.intention === intention && styles.chipSelected]}
            onPress={() => props.setIntention(intention)}
            accessibilityState={{ selected: props.intention === intention }}
          >
            <Text style={styles.chipText}>{intention}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.primaryButton} onPress={props.onSubmit} disabled={props.busy}>
        <Plus size={20} color="#fff" />
        <Text style={styles.primaryText}>加入今日任務池</Text>
      </Pressable>
    </BottomSheet>
  );
}

function ReflectSheet(props) {
  const todo = props.session?.todos?.[0];
  const elapsedMinutes = props.session
    ? Math.max(1, Math.round(getElapsedMs(props.session) / 60000))
    : 0;
  return (
    <BottomSheet visible={props.visible} onClose={props.onClose} dismissible={false}>
      <Text style={styles.sheetTitle}>這段時間結果如何？</Text>
      {todo ? (
        <Text style={styles.muted}>
          {todo.title} · 原估 {props.session.durationMinutes}m · 目前 {elapsedMinutes}m
        </Text>
      ) : null}
      <View style={styles.outcomeGrid}>
        {[
          ["done", "完成"],
          ["partial", "有進展"],
          ["blocked", "沒完成"]
        ].map(([value, label]) => (
          <Pressable
            key={value}
            style={[styles.outcomeButton, props.outcome === value && styles.outcomeSelected]}
            onPress={() => props.setOutcome(value)}
            accessibilityState={{ selected: props.outcome === value }}
          >
            <Text style={styles.outcomeText}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {props.outcome !== "done" ? (
        <>
          <Text style={styles.sheetLabel}>主要原因</Text>
          <View style={styles.reasonGrid}>
            {REASONS.map(([value, label]) => (
              <Pressable
                key={value}
                style={[styles.reasonChip, props.reason === value && styles.chipSelected]}
                onPress={() => props.setReason(value)}
                accessibilityState={{ selected: props.reason === value }}
              >
                <Text style={styles.chipText}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.sheetLabel}>下一步</Text>
          <View style={styles.reasonGrid}>
            {[
              ["continue", "繼續排下一輪"],
              ["defer", "延後到稍後"],
              ["drop", "先丟棄"]
            ].map(([value, label]) => (
              <Pressable
                key={value}
                style={[styles.reasonChip, props.nextAction === value && styles.chipSelected]}
                onPress={() => props.setNextAction(value)}
                accessibilityState={{ selected: props.nextAction === value }}
              >
                <Text style={styles.chipText}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <TextInput
        style={[styles.input, styles.textarea]}
        value={props.note}
        onChangeText={props.setNote}
        placeholder="補一句給未來的自己（可選）"
        accessibilityLabel="本輪回顧備註"
        multiline
      />
      <Pressable style={[styles.primaryButton, props.submitting && styles.disabledButton]} onPress={props.onSubmit} disabled={props.submitting}>
        <CheckCircle2 size={20} color="#fff" />
        <Text style={styles.primaryText}>{props.submitting ? "儲存中..." : "儲存回報"}</Text>
      </Pressable>
    </BottomSheet>
  );
}

function BottomSheet({ visible, onClose, children, dismissible = true }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <NativePressable style={styles.backdrop} onPress={dismissible ? onClose : undefined} accessible={false} />
      <KeyboardAvoidingView style={{ maxHeight: "90%" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TabBar({ tab, setTab, hasActiveSession }) {
  return (
    <View style={styles.tabBar}>
      <TabButton icon={Clock3} label="今日" active={tab === "today"} onPress={() => setTab("today")} />
      <TabButton icon={Play} label="專注" active={tab === "focus"} onPress={() => setTab("focus")} highlighted={hasActiveSession} />
      <TabButton icon={History} label="回顧" active={tab === "history"} onPress={() => setTab("history")} />
    </View>
  );
}

function TabButton({ icon: Icon, label, active, highlighted, onPress }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} style={[styles.tabButton, active && styles.tabActive]} onPress={onPress}>
      <Icon size={20} color={active || highlighted ? "#0f5f55" : "#667085"} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function IconButton({ icon: Icon, label, onPress }) {
  return (
    <Pressable style={styles.iconButton} onPress={onPress}>
      <Icon size={19} color="#18212f" />
      <Text style={styles.iconButtonText}>{label}</Text>
    </Pressable>
  );
}

function TagLine({ tags = [], minutes, dark = false }) {
  return (
    <Text style={[styles.tagLine, dark && styles.tagLineDark]}>
      {tags.length ? tags.map((tag) => `#${tag}`).join("  ") : "#untagged"} · {minutes}m
    </Text>
  );
}

const styles = StyleSheet.create({
  notificationWarning: {
    padding: 12, backgroundColor: "#fff1d6", color: "#5c3b00", fontSize: 14
  },
  shell: {
    flex: 1,
    backgroundColor: "#f6f4ef"
  },
  content: {
    flex: 1
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 110
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f6f4ef",
    padding: 24
  },
  loading: {
    fontSize: 28,
    fontWeight: "800",
    color: "#18212f"
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  kicker: {
    color: "#0f5f55",
    fontWeight: "800",
    marginBottom: 4,
    textTransform: "uppercase"
  },
  title: {
    color: "#18212f",
    fontSize: 28,
    fontWeight: "800"
  },
  nextPanel: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 18,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#dfdad0"
  },
  sectionLabel: {
    color: "#b74d36",
    fontWeight: "800",
    marginBottom: 10
  },
  nextTitle: {
    color: "#18212f",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800"
  },
  muted: {
    color: "#667085",
    lineHeight: 21
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: "#0f5f55",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 16
  },
  disabledButton: {
    opacity: 0.62
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800"
  },
  iconButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dfdad0",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12
  },
  iconButtonText: {
    color: "#18212f",
    fontWeight: "700"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  chip: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d5d0c7",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12
  },
  chipSelected: {
    borderColor: "#0f5f55",
    backgroundColor: "#dff2ec"
  },
  chipText: {
    color: "#28405f",
    fontWeight: "700"
  },
  insightPanel: {
    borderRadius: 8,
    backgroundColor: "#e8f3ef",
    borderWidth: 1,
    borderColor: "#c9e0d8",
    padding: 14,
    marginTop: 18,
    flexDirection: "row",
    gap: 10
  },
  insightText: {
    color: "#1f3a34",
    fontWeight: "700",
    flex: 1,
    lineHeight: 21
  },
  sectionTitle: {
    marginTop: 24,
    marginBottom: 10,
    color: "#18212f",
    fontSize: 18,
    fontWeight: "800"
  },
  taskCard: {
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dfdad0",
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  taskIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#edf1f5",
    alignItems: "center",
    justifyContent: "center"
  },
  taskBody: {
    flex: 1
  },
  taskTitle: {
    color: "#18212f",
    fontSize: 16,
    fontWeight: "800"
  },
  tagLine: {
    color: "#667085",
    marginTop: 6
  },
  tagLineDark: {
    color: "#dce7e4",
    textAlign: "center"
  },
  focusScreen: {
    flexGrow: 1,
    backgroundColor: "#18212f",
    padding: 24,
    paddingBottom: 110,
    alignItems: "center",
    justifyContent: "center"
  },
  focusKicker: {
    color: "#8fe0cf",
    fontWeight: "800",
    marginBottom: 8
  },
  focusTitle: {
    color: "#ffffff",
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    textAlign: "center"
  },
  timer: {
    color: "#ffffff",
    fontSize: 74,
    fontVariant: ["tabular-nums"],
    fontWeight: "900",
    marginVertical: 34
  },
  focusActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8
  },
  secondaryDarkButton: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#526070",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  secondaryDarkText: {
    color: "#f7f3ec",
    fontWeight: "800"
  },
  lightButton: {
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: "#f7f3ec",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  lightButtonText: {
    color: "#18212f",
    fontWeight: "900"
  },
  statCard: {
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dfdad0",
    padding: 14,
    marginBottom: 10
  },
  statTitle: {
    color: "#18212f",
    fontWeight: "900",
    marginBottom: 4
  },
  recordCard: {
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dfdad0",
    padding: 14,
    marginBottom: 10
  },
  note: {
    color: "#344054",
    marginTop: 8,
    lineHeight: 21
  },
  tabBar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    minHeight: 64,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dfdad0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 6
  },
  tabButton: {
    minWidth: 92,
    minHeight: 50,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  tabActive: {
    backgroundColor: "#e8f3ef"
  },
  tabText: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2
  },
  tabTextActive: {
    color: "#0f5f55"
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(24, 33, 47, 0.4)"
  },
  sheet: {
    flexShrink: 1,
    backgroundColor: "#f6f4ef",
    padding: 20,
    paddingBottom: 34,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8
  },
  sheetTitle: {
    color: "#18212f",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 12
  },
  sheetLabel: {
    color: "#344054",
    fontWeight: "800",
    marginTop: 16
  },
  input: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d5d0c7",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    marginTop: 10,
    color: "#18212f"
  },
  textarea: {
    minHeight: 92,
    paddingTop: 12
  },
  outcomeGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 18
  },
  outcomeButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d5d0c7",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center"
  },
  outcomeSelected: {
    borderColor: "#0f5f55",
    backgroundColor: "#dff2ec"
  },
  outcomeText: {
    color: "#18212f",
    fontWeight: "900"
  },
  reasonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10
  },
  reasonChip: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d5d0c7",
    backgroundColor: "#ffffff",
    justifyContent: "center",
    paddingHorizontal: 12
  }
});
