import { pipelineStages } from '../domain/lifecycle';
import { DEMO_MODE } from '../config/runtime';
export function Pipeline({ metrics = false }: { metrics?: boolean }) {
  const counts = [148, 82, 46, 38, 24, 16, 9];
  return (
    <section className="pipeline" aria-label="Seven-Stage Customer Pipeline">
      <div className="pipeline-header">
        <span>PUBLIC / ACQUISITION</span>
        <span>CUSTOMER / APP LIFECYCLE</span>
      </div>
      <ol className="pipeline-stages">
        {pipelineStages.map((stage, index) => (
          <li key={stage.id} className={`pipeline-stage ${stage.id === 4 ? 'bridge' : ''}`}>
            <span className="pipeline-number">{stage.id}</span>
            <h3>{stage.title}</h3>
            {metrics ? (
              <strong>{DEMO_MODE ? counts[index] : '—'}</strong>
            ) : (
              <small>{stage.description}</small>
            )}
            {stage.id === 4 && <small>Public, trial & registered</small>}
          </li>
        ))}
      </ol>
      <p className="pipeline-loop">
        <span aria-hidden="true">↗</span> Feedback and referrals lead back to a new introduction.
        {metrics && ` ${DEMO_MODE ? 'Illustrative metrics, not live data.' : 'Metrics integration pending.'}`}
      </p>
    </section>
  );
}
