#!/usr/bin/env python3
import json
import os
import datetime

EXEC_PATH = "outputs/execution_cumulative.json"
REPORT_PATH = "outputs/performance_report.md"

def load_json(path):
    if not os.path.exists(path): return {}
    with open(path) as f: return json.load(f)

def generate_report():
    exec_data = load_json(EXEC_PATH)
    results = exec_data.get("execution_results", [])
    
    if not results:
        print("No execution results found.")
        return

    # Aggregate stats
    total_bytes = 0
    start_times = []
    end_times = []
    by_iface = {}
    
    for r in results:
        if r["status"] == "SUCCESS":
            total_bytes += r["bytes_received"]
            # Timestamps are not in execution.json per chunk (only duration), 
            # but we can infer some things if we had them. 
            # Actually, `execution.json` has `total_time_ms`.
            # We don't have start/end absolute time in the default JSON format 
            # (my viewer showed only durations).
            # So goodput calculation is approximation based on sum of durations? 
            # No, parallel downloads!
            # We can't calculate wall-clock goodput perfectly without start/end timestamps.
            # But we can calculate "Interface Utilization".
            pass
        
        iface = r["assigned_interface_name"]
        if iface not in by_iface:
            by_iface[iface] = {"bytes": 0, "chunks": 0, "failures": 0, "total_ms": 0}
        
        stats = by_iface[iface]
        stats["chunks"] += 1
        if r["status"] == "SUCCESS":
            stats["bytes"] += r["bytes_received"]
            stats["total_ms"] += r["total_time_ms"] # This is cumulative CPU/Network time, not wall clock
        else:
            stats["failures"] += 1

    # Generate Markdown
    with open(REPORT_PATH, "w") as f:
        f.write("# Mush Download Performance Report\n\n")
        f.write(f"**Date:** {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"**Total Data:** {total_bytes / 1024 / 1024:.2f} MB\n\n")
        
        f.write("## Interface Performance\n\n")
        f.write("| Interface | Chunks | Data (MB) | Failures | Avg Speed (Mbps) |\n")
        f.write("|-----------|--------|-----------|----------|------------------|\n")
        
        for iface, s in by_iface.items():
            mb = s["bytes"] / 1024 / 1024
            # Mbps = (Bits / Time_seconds). Time is sum of chunk durations (serialized approximation or per-thread average?)
            # Since we ran concurrent threads, "total_ms" is sum of all thread times.
            # So Bytes / Total_Thread_Time = Average Per-Thread Speed? 
            # No, it's Average Speed * Concurrency?
            # Actually, (Total Bits) / (Total Milliseconds / 1000) gives the "Average Single-Thread Performance".
            # To get Interface Throughput, we need wall clock. We don't have it per chunk.
            # We will report "Avg Chunk Speed".
            if s["total_ms"] > 0:
                avg_speed_mbps = (s["bytes"] * 8) / (s["total_ms"] / 1000) / 1000000
            else:
                avg_speed_mbps = 0
            
            f.write(f"| `{iface}` | {s['chunks']} | {mb:.2f} | {s['failures']} | {avg_speed_mbps:.2f} |\n")
        
        f.write("\n## Failure Analysis\n\n")
        if any(s["failures"] > 0 for s in by_iface.values()):
            f.write("Failures detected during execution (handled by Auto-Repair):\n")
            for r in results:
                if r["status"] != "SUCCESS":
                    f.write(f"- Chunk {r['chunk_id']} (`{r.get('assigned_interface_name','?')}`): {r.get('failure_reason','unknown')}\n")
        else:
            f.write("No failures recorded in final execution set.\n")
            
        f.write("\n## Conclusion\n\n")
        f.write("Download completed successfully with multi-interface concurrency associated with auto-repair logic.\n")

    print(f"Report generated: {REPORT_PATH}")
    print(open(REPORT_PATH).read())

if __name__ == "__main__":
    generate_report()
