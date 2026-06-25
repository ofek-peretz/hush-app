"""
Run the full comparison: population × {Bayesian, Double Progression} × {26, 52 weeks}.
Emits CSVs, PNG graphs, and the aggregate tables + numeric conclusion to stdout.
"""
from __future__ import annotations
import csv
import os
import statistics as st

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from harness import population, run_profile, CAPABILITY, DIFFICULTY
from hush_model.capability.reference_strength import reference_strength
import metrics as M

HERE = os.path.dirname(os.path.abspath(__file__))
PLOTS = os.path.join(HERE, "plots")
os.makedirs(PLOTS, exist_ok=True)
ENGINES = ["Bayesian", "Double Progression"]
COLORS = {"Bayesian": "#c1121f", "Double Progression": "#0a6e5c", "true": "#777777"}

CORE_IDS = ["beg_fast", "beg_steady", "int_fast", "int_steady",
            "int_slow", "adv_steady", "adv_slow", "plateauer"]
ROB_IDS = ["rob_badweek", "rob_missed", "rob_dip"]


def run_all(weeks: int):
    profs = population()
    out = {}
    for p in profs:
        runs = run_profile(p, weeks)
        out[p.id] = {"profile": p, "metrics": {e: M.compute(runs[e]) for e in ENGINES},
                     "runs": runs}
    return out


def write_csv(results: dict, weeks: int):
    path = os.path.join(HERE, f"metrics_{weeks}wk.csv")
    keys = [k for k in M.compute(results[CORE_IDS[0]]["runs"]["Bayesian"]) if not k.startswith("_")]
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["profile", "engine"] + keys)
        for pid, d in results.items():
            for e in ENGINES:
                m = d["metrics"][e]
                w.writerow([d["profile"].label, e] + [round(m[k], 3) if isinstance(m[k], float) else m[k] for k in keys])
    return path


def plot_trajectories(results: dict, ids: list[str], fname: str, title: str, ncols=2):
    nrows = (len(ids) + ncols - 1) // ncols
    fig, axes = plt.subplots(nrows, ncols, figsize=(7.0 * ncols, 3.2 * nrows), squeeze=False)
    for ax, pid in zip([a for row in axes for a in row], ids):
        d = results[pid]
        m_bay = d["metrics"]["Bayesian"]
        m_dp = d["metrics"]["Double Progression"]
        ax.plot(m_bay["_weeks"], m_bay["_true_target"], "--", color=COLORS["true"],
                lw=1.6, label="true capacity (goal reps)")
        ax.plot(m_bay["_weeks"], m_bay["_weights"], color=COLORS["Bayesian"], lw=1.8, label="Bayesian")
        ax.plot(m_dp["_weeks"], m_dp["_weights"], color=COLORS["Double Progression"], lw=1.8,
                label="Double Progression")
        ax.set_title(d["profile"].label, fontsize=10)
        ax.set_xlabel("week"); ax.set_ylabel("working weight (kg)")
        ax.grid(alpha=0.25)
    axes[0][0].legend(fontsize=8, loc="upper left")
    fig.suptitle(title, fontsize=13, y=1.0)
    fig.tight_layout()
    path = os.path.join(PLOTS, fname)
    fig.savefig(path, dpi=110, bbox_inches="tight"); plt.close(fig)
    return path


def plot_summary_bars(results: dict, weeks: int):
    """Population-mean key metrics, side by side."""
    metric_labels = [
        ("efficiency_end", "load vs true\ncapacity (end)"),
        ("pct_training_failure", "% sessions\nfailed"),
        ("pct_overload", "% sessions\noverloaded"),
        ("pct_stuck", "% sessions\nstuck"),
        ("pct_counterintuitive", "% counter-\nintuitive"),
        ("direction_changes", "direction\nchanges"),
    ]
    core = [results[i] for i in CORE_IDS]
    means = {e: {} for e in ENGINES}
    for key, _ in metric_labels:
        for e in ENGINES:
            means[e][key] = st.mean(d["metrics"][e][key] for d in core)
    fig, axes = plt.subplots(2, 3, figsize=(13, 6.5))
    for ax, (key, lab) in zip([a for row in axes for a in row], metric_labels):
        vals = [means[e][key] for e in ENGINES]
        bars = ax.bar(ENGINES, vals, color=[COLORS[e] for e in ENGINES])
        ax.set_title(lab, fontsize=10)
        ax.set_xticks(range(len(ENGINES)))
        ax.set_xticklabels(ENGINES, fontsize=8)
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v, f"{v:.2f}", ha="center",
                    va="bottom", fontsize=9)
        ax.grid(alpha=0.2, axis="y")
    fig.suptitle(f"Population means across the 8 responder profiles — {weeks} weeks", fontsize=13)
    fig.tight_layout()
    path = os.path.join(PLOTS, f"fig_summary_bars_{weeks}wk.png")
    fig.savefig(path, dpi=110, bbox_inches="tight"); plt.close(fig)
    return path


def fmt(v):
    if v is None:
        return "—"
    if isinstance(v, float):
        return f"{v:.2f}"
    return str(v)


def print_table(results: dict, weeks: int, rows: list[str]):
    cols = [
        ("weight_end", "Wend"), ("efficiency_end", "Eff_end"), ("rate_kg_per_week", "kg/wk"),
        ("first_plateau_week", "plateau_wk"), ("pct_training_failure", "%fail"),
        ("pct_overload", "%over"), ("pct_stuck", "%stuck"),
        ("pct_counterintuitive", "%counter"), ("direction_changes", "dir_chg"),
        ("e1rm_end", "e1RM"),
    ]
    print(f"\n===== {weeks}-WEEK METRICS =====")
    header = f"{'profile':<32}{'engine':<22}" + "".join(f"{c[1]:>11}" for c in cols)
    print(header); print("-" * len(header))
    for pid in rows:
        d = results[pid]
        for e in ENGINES:
            m = d["metrics"][e]
            line = f"{d['profile'].label[:31]:<32}{e:<22}" + "".join(
                f"{fmt(m[c[0]]):>11}" for c in cols)
            print(line)
        print()


def aggregate_conclusion(r52: dict):
    core = [r52[i] for i in CORE_IDS]
    agg = {e: {} for e in ENGINES}
    keys = ["efficiency_end", "weight_end", "e1rm_end", "rate_kg_per_week",
            "pct_training_failure", "pct_overload", "pct_stuck",
            "pct_counterintuitive", "direction_changes", "volatility_kg",
            "pct_increase_aggressive"]
    for k in keys:
        for e in ENGINES:
            agg[e][k] = st.mean(d["metrics"][e][k] for d in core)
    return agg


def coupled_sensitivity(weeks: int = 52, couplings=(0.0, 0.5, 1.0)):
    """Sensitivity: under an ASSUMED, symmetric, conservative load→adaptation dose-response,
    how far apart is the athletes' FINAL TRUE strength? Coupling 0 = exogenous (both bodies
    identical by construction). The dose-response is capped at the shared baseline gain, so it
    can only expose the cost of under-loading — never reward DP above the baseline."""
    profs = population()
    core = [p for p in profs if p.id in CORE_IDS]
    rows = []
    for c in couplings:
        finals = {e: [] for e in ENGINES}
        for p in core:
            runs = run_profile(p, weeks, coupling=c)
            for e in ENGINES:
                final_true_score = runs[e][-1].true_score
                finals[e].append(reference_strength(CAPABILITY, final_true_score) * DIFFICULTY)
        rows.append((c, st.mean(finals["Bayesian"]), st.mean(finals["Double Progression"])))
    print("\n===== COUPLED-ADAPTATION SENSITIVITY — mean final TRUE 1RM (kg), 52wk, 8 profiles =====")
    print(f"{'coupling':>10}{'Bayesian':>14}{'DoubleProg':>14}{'DP advantage':>15}")
    print("-" * 53)
    for c, b, d in rows:
        adv = f"+{100*(d/b-1):.1f}%"
        print(f"{c:>10.1f}{b:>14.1f}{d:>14.1f}{adv:>15}")
    # plot
    fig, ax = plt.subplots(figsize=(7, 4.5))
    cs = [r[0] for r in rows]
    ax.plot(cs, [r[1] for r in rows], "-o", color=COLORS["Bayesian"], label="Bayesian")
    ax.plot(cs, [r[2] for r in rows], "-o", color=COLORS["Double Progression"], label="Double Progression")
    ax.set_xlabel("stimulus→adaptation coupling (0 = exogenous)")
    ax.set_ylabel("mean final TRUE 1RM (kg)")
    ax.set_title("Real strength outcome under an assumed load→adaptation dose-response")
    ax.legend(); ax.grid(alpha=0.25)
    fig.tight_layout()
    path = os.path.join(PLOTS, "fig_coupled_sensitivity.png")
    fig.savefig(path, dpi=110, bbox_inches="tight"); plt.close(fig)
    return rows, path


def main():
    r26 = run_all(26)
    r52 = run_all(52)
    write_csv(r26, 26); write_csv(r52, 52)
    print_table(r26, 26, CORE_IDS)
    print_table(r52, 52, CORE_IDS)
    print_table(r52, 52, ROB_IDS)

    p1 = plot_trajectories(r52, CORE_IDS, "fig_trajectories_52wk.png",
                           "Working weight vs TRUE capacity — 12 months (3×/week)")
    p2 = plot_trajectories(r52, ROB_IDS, "fig_robustness_52wk.png",
                           "Robustness studies — response to a bad week / missed week / dip", ncols=3)
    p3 = plot_summary_bars(r52, 52)
    p4 = plot_summary_bars(r26, 26)

    agg = aggregate_conclusion(r52)
    print("\n===== POPULATION AGGREGATE (8 responder profiles, 52 weeks) =====")
    print(f"{'metric':<28}{'Bayesian':>14}{'DoubleProg':>14}")
    print("-" * 56)
    for k in agg["Bayesian"]:
        print(f"{k:<28}{agg['Bayesian'][k]:>14.2f}{agg['Double Progression'][k]:>14.2f}")

    sens, p5 = coupled_sensitivity(52)

    print("\nplots:", p1, p2, p3, p4, p5, sep="\n  ")
    return r26, r52, agg, sens


if __name__ == "__main__":
    main()
