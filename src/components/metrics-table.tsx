import type { Metrics } from "@/lib/types";

export function rating(value: number | null | undefined) {
  return value == null ? "—" : Number(value).toFixed(1);
}
export function MetricsTable({ stats }: { stats: Metrics }) {
  return (
    <>
      <table className="metrics-table">
        <caption>Average student ratings · all values out of 5</caption>
        <thead>
          <tr>
            <th scope="col">Overall</th>
            <th scope="col">Workload</th>
            <th scope="col">Grading difficulty</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {rating(stats.overall_rating)}
              <span className="metric-label">Higher is better</span>
            </td>
            <td>
              {rating(stats.workload_rating)}
              <span className="metric-label">Higher is more work</span>
            </td>
            <td>
              {rating(stats.grading_difficulty)}
              <span className="metric-label">Higher is harder</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="archive-note">
        Averages reflect the reviews available, not a guarantee of your experience. A dash means no
        rating was reported.
      </p>
    </>
  );
}
