/** Role-aware home. The heading is the role's landing name (ui_spec §2); the
 * cards offer what the role can reach. A card links only to a built screen;
 * the rest say "Coming soon" instead of linking to a screen that does not
 * exist yet. */

import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { cardsFor, type HomeCard, type HomeCardId } from '../../config/homeCards';
import { LANDING_NAME } from '../../config/roleRoutes';
import type { Role } from '../../types/auth';
import { ApplicationsIcon, AuditIcon, PolicyIcon, QueueIcon } from '../components/icons';
import styles from './HomePage.module.css';

const ICONS: Record<HomeCardId, (props: { size?: number }) => JSX.Element> = {
  applications: ApplicationsIcon,
  queue: QueueIcon,
  policies: PolicyIcon,
  audit: AuditIcon,
};

function CardBody({ card }: { card: HomeCard }): JSX.Element {
  const Icon = ICONS[card.id];
  return (
    <>
      <span className={styles.icon}>
        <Icon size={28} />
      </span>
      <h2 className={styles.cardTitle}>{card.title}</h2>
      <p className={styles.cardText}>{card.description}</p>
      {card.to ? null : <span className={styles.soon}>Coming soon</span>}
    </>
  );
}

function HomeCardView({ card }: { card: HomeCard }): JSX.Element {
  if (card.to) {
    return (
      <li>
        <Link to={card.to} className={`${styles.card} ${styles.cardLink}`}>
          <CardBody card={card} />
        </Link>
      </li>
    );
  }
  return (
    <li>
      <div className={`${styles.card} ${styles.cardIdle}`}>
        <CardBody card={card} />
      </div>
    </li>
  );
}

export function HomePage({ role }: { role: Role }): JSX.Element {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>{LANDING_NAME[role]}</h1>
      <p className={styles.lead}>Pick up where you left off.</p>
      <ul className={styles.grid}>
        {cardsFor(role).map((card) => (
          <HomeCardView key={card.id} card={card} />
        ))}
      </ul>
    </main>
  );
}
