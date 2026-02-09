/**
 * Badge milestones and names for Donor and Driver.
 * Donor count = donations with status 'delivered'.
 * Driver count = deliveries with status 'delivered' and assignedDriverId.
 */

const DONOR_MILESTONES = [1, 25, 50, 100];
const DONOR_BADGE_NAMES = [
  'First Spark',
  'Silver Donation',
  'Gold Donation',
  'Centurion Donation',
];

const DRIVER_MILESTONES = [1, 25, 50, 100];
const DRIVER_BADGE_NAMES = [
  'First Spark',
  'Silver Delivery',
  'Gold Delivery',
  'Centurion Delivery',
];

const BADGE_KEYS = ['first_spark', 'silver', 'gold', 'centurion'];

/**
 * Get badge progress for a given count.
 * @param {number} count - Delivered donations (donor) or deliveries (driver)
 * @param {number[]} milestones - e.g. [1, 25, 50, 100]
 * @param {string[]} names - Badge display names
 * @returns {{ currentBadge: string|null, currentBadgeKey: string|null, nextBadge: string|null, nextMilestone: number|null, remaining: number, timeline: Array<{ milestone: number, name: string, achieved: boolean }> }}
 */
function getBadgeProgress(count, milestones, names) {
  const timeline = milestones.map((milestone, index) => ({
    milestone,
    name: names[index] || `Badge ${milestone}`,
    achieved: count >= milestone,
  }));

  let currentBadge = null;
  let currentBadgeKey = null;
  let nextBadge = null;
  let nextMilestone = null;

  for (let i = milestones.length - 1; i >= 0; i--) {
    if (count >= milestones[i]) {
      currentBadge = names[i];
      currentBadgeKey = BADGE_KEYS[i];
      if (i < milestones.length - 1) {
        nextBadge = names[i + 1];
        nextMilestone = milestones[i + 1];
      }
      break;
    }
    nextBadge = names[i];
    nextMilestone = milestones[i];
  }

  const remaining = nextMilestone != null ? Math.max(0, nextMilestone - count) : 0;

  return {
    currentBadge,
    currentBadgeKey,
    nextBadge,
    nextMilestone,
    remaining,
    timeline,
  };
}

module.exports = {
  DONOR_MILESTONES,
  DONOR_BADGE_NAMES,
  DRIVER_MILESTONES,
  DRIVER_BADGE_NAMES,
  BADGE_KEYS,
  getBadgeProgress,
};
