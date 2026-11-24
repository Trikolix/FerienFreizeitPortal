import { bookingStatus } from '../utils/portal';

export interface BookingStatistic {
  provider_id: number;
  camp_id: number;
  title: string;
  status: string;
  bookings: number;
  participants: number;
}

function statTone(status: string) {
  if (status === 'confirmed') return 'is-live';
  if (status === 'reserved' || status === 'waitlist') return 'is-warning';
  if (status === 'rejected' || status === 'cancelled') return 'is-danger';
  return '';
}

export function BookingStatistics({ rows }: { rows: BookingStatistic[] }) {
  return (
    <section className="portal-panel">
      <h2>Buchungsauswertung</h2>
      {rows.length ? (
        <div className="table-scroll">
          <table className="portal-table">
            <caption>Anmeldungen und Teilnehmende nach Freizeit und Status</caption>
            <thead>
              <tr>
                <th>Freizeit</th>
                <th>Status</th>
                <th>Anmeldungen</th>
                <th>Teilnehmende</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={`${row.provider_id}-${row.camp_id}-${row.status}`}>
                  <th scope="row">{row.title}</th>
                  <td><span className={`status-pill ${statTone(row.status)}`}>{bookingStatus[row.status]}</span></td>
                  <td>{row.bookings}</td>
                  <td>{row.participants}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="editor-help">Für diese Auswahl liegen noch keine Anmeldungen vor.</p>
      )}
    </section>
  );
}
