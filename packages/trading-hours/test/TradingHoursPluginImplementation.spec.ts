import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

const SECONDS_PER_DAY = 86400;
const SAT_SUN_MASK = 0b1000001; // bit0 = Sunday, bit6 = Saturday
const ALL_DAYS_MASK = 0b1111111;

// 2024-01-01 is a Monday (UTC). Verified against JS Date.getUTCDay() before writing this file.
function utc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  return Math.floor(Date.UTC(year, month - 1, day, hour, minute, second) / 1000);
}

const MONDAY = utc(2024, 1, 1); // weekday
const TUESDAY = utc(2024, 1, 2); // weekday
const FRIDAY = utc(2024, 1, 5); // weekday
const SATURDAY = utc(2024, 1, 6);
const SUNDAY = utc(2024, 1, 7);

function packWindow(startSeconds: number, endSeconds: number): { startSeconds: number; endSeconds: number } {
  return { startSeconds, endSeconds };
}

describe('TradingHoursPluginImplementation', function () {
  async function deployFixture() {
    const TradingHoursPluginImplementation = await ethers.getContractFactory('TradingHoursPluginImplementation');
    const tradingHours = await TradingHoursPluginImplementation.deploy();
    return { tradingHours };
  }

  describe('Disabled by default', function () {
    it('should start disabled', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      expect(await tradingHours.getEnabled()).to.be.false;
    });

    it('should allow trading at any time while disabled, including a weekend timestamp', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      expect(await tradingHours.isTradingAllowed(SATURDAY)).to.be.true;
      expect(await tradingHours.isTradingAllowed(SUNDAY + 3600)).to.be.true;
      expect(await tradingHours.isTradingAllowed(0)).to.be.true;
    });

    it('should not revert verifyTrading while disabled', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await expect(tradingHours.verifyTrading()).to.not.be.reverted;
    });

    it('should default trading hours to zero and weekday mask to zero', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      const [start, end] = await tradingHours.getTradingHours();
      expect(start).to.equal(0);
      expect(end).to.equal(0);
      expect(await tradingHours.getBlockedWeekdays()).to.equal(0);
      expect(await tradingHours.getDayOfWeekOffset()).to.equal(0);
    });
  });

  describe('Enable / disable', function () {
    it('should turn on restrictions once enabled', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setBlockedWeekdays(ALL_DAYS_MASK);
      await tradingHours.setEnabled(true);

      expect(await tradingHours.isTradingAllowed(MONDAY)).to.be.false;
    });

    it('should keep configuration when disabled and restore it on re-enable', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(9 * 3600, 18 * 3600);
      await tradingHours.setBlockedWeekdays(SAT_SUN_MASK);
      await tradingHours.setEnabled(true);

      expect(await tradingHours.isTradingAllowed(SATURDAY)).to.be.false;

      await tradingHours.setEnabled(false);
      expect(await tradingHours.isTradingAllowed(SATURDAY)).to.be.true;

      await tradingHours.setEnabled(true);
      expect(await tradingHours.isTradingAllowed(SATURDAY)).to.be.false;

      const [start, end] = await tradingHours.getTradingHours();
      expect(start).to.equal(9 * 3600);
      expect(end).to.equal(18 * 3600);
    });
  });

  describe('Trading hours window', function () {
    it('should allow exactly at start (inclusive) and block one second before', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(9 * 3600, 18 * 3600);
      await tradingHours.setEnabled(true);

      const start = MONDAY + 9 * 3600;
      expect(await tradingHours.isTradingAllowed(start - 1)).to.be.false;
      expect(await tradingHours.isTradingAllowed(start)).to.be.true;
    });

    it('should block exactly at end (exclusive) and allow one second before', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(9 * 3600, 18 * 3600);
      await tradingHours.setEnabled(true);

      const end = MONDAY + 18 * 3600;
      expect(await tradingHours.isTradingAllowed(end - 1)).to.be.true;
      expect(await tradingHours.isTradingAllowed(end)).to.be.false;
    });

    it('should allow the whole day when start=0 end=1 days', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);

      expect(await tradingHours.isTradingAllowed(MONDAY)).to.be.true;
      expect(await tradingHours.isTradingAllowed(MONDAY + SECONDS_PER_DAY - 1)).to.be.true;
    });

    it('should allow a one-second window only at that exact second', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(43200, 43201);
      await tradingHours.setEnabled(true);

      expect(await tradingHours.isTradingAllowed(MONDAY + 43199)).to.be.false;
      expect(await tradingHours.isTradingAllowed(MONDAY + 43200)).to.be.true;
      expect(await tradingHours.isTradingAllowed(MONDAY + 43201)).to.be.false;
    });

    it('should revert with InvalidTradingHours when start >= end', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await expect(tradingHours.setTradingHours(100, 100)).to.be.revertedWithCustomError(tradingHours, 'InvalidTradingHours');
      await expect(tradingHours.setTradingHours(200, 100)).to.be.revertedWithCustomError(tradingHours, 'InvalidTradingHours');
    });

    it('should revert with InvalidTradingHours when end > 1 days', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await expect(tradingHours.setTradingHours(0, SECONDS_PER_DAY + 1)).to.be.revertedWithCustomError(
        tradingHours,
        'InvalidTradingHours'
      );
    });

    it('should accept end == 1 days exactly', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await expect(tradingHours.setTradingHours(0, SECONDS_PER_DAY)).to.not.be.reverted;
    });
  });

  describe('Blocked weekdays', function () {
    async function enabledAllHours(tradingHours: any, mask: number, offset = 0) {
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setBlockedWeekdays(mask);
      await tradingHours.setDayOfWeekOffset(offset);
      await tradingHours.setEnabled(true);
    }

    it('should block Saturday and Sunday with the default-style mask, allow weekdays', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await enabledAllHours(tradingHours, SAT_SUN_MASK);

      expect(await tradingHours.isTradingAllowed(SATURDAY)).to.be.false;
      expect(await tradingHours.isTradingAllowed(SUNDAY)).to.be.false;
      expect(await tradingHours.isTradingAllowed(MONDAY)).to.be.true;
      expect(await tradingHours.isTradingAllowed(TUESDAY)).to.be.true;
      expect(await tradingHours.isTradingAllowed(FRIDAY)).to.be.true;
    });

    it('should never block any day when mask is zero', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await enabledAllHours(tradingHours, 0);

      for (const ts of [MONDAY, TUESDAY, FRIDAY, SATURDAY, SUNDAY]) {
        expect(await tradingHours.isTradingAllowed(ts)).to.be.true;
      }
    });

    it('should block every day when mask is 0x7F', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await enabledAllHours(tradingHours, ALL_DAYS_MASK);

      for (const ts of [MONDAY, TUESDAY, FRIDAY, SATURDAY, SUNDAY]) {
        expect(await tradingHours.isTradingAllowed(ts)).to.be.false;
      }
    });

    it('should support a custom Friday+Saturday weekend', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      const friSatMask = (1 << 5) | (1 << 6);
      await enabledAllHours(tradingHours, friSatMask);

      expect(await tradingHours.isTradingAllowed(utc(2024, 1, 4))).to.be.true; // Thursday
      expect(await tradingHours.isTradingAllowed(FRIDAY)).to.be.false;
      expect(await tradingHours.isTradingAllowed(SATURDAY)).to.be.false;
      expect(await tradingHours.isTradingAllowed(SUNDAY)).to.be.true;
    });

    it('should revert with InvalidBlockedWeekdaysMask when bit 7 is set', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await expect(tradingHours.setBlockedWeekdays(0x80)).to.be.revertedWithCustomError(
        tradingHours,
        'InvalidBlockedWeekdaysMask'
      );
      await expect(tradingHours.setBlockedWeekdays(0xff)).to.be.revertedWithCustomError(
        tradingHours,
        'InvalidBlockedWeekdaysMask'
      );
    });

    it('should accept mask 0x7F as the maximum valid value', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await expect(tradingHours.setBlockedWeekdays(0x7f)).to.not.be.reverted;
    });

    it('should shift the weekday boundary backward with a negative (UTC-5) offset', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      const offset = -5 * 3600; // UTC-5, e.g. New York without DST
      await enabledAllHours(tradingHours, SAT_SUN_MASK, offset);

      // local midnight Saturday happens 5h after UTC midnight Saturday
      const localSaturdayMidnightUtc = SATURDAY - offset;
      expect(await tradingHours.isTradingAllowed(localSaturdayMidnightUtc - 1)).to.be.true; // still local Friday
      expect(await tradingHours.isTradingAllowed(localSaturdayMidnightUtc)).to.be.false; // local Saturday begins
    });

    it('should shift the weekday boundary forward with a positive (UTC+9) offset', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      const offset = 9 * 3600; // UTC+9, e.g. Tokyo
      await enabledAllHours(tradingHours, SAT_SUN_MASK, offset);

      // local midnight Saturday happens 9h before UTC midnight Saturday
      const localSaturdayMidnightUtc = SATURDAY - offset;
      expect(await tradingHours.isTradingAllowed(localSaturdayMidnightUtc - 1)).to.be.true; // still local Friday
      expect(await tradingHours.isTradingAllowed(localSaturdayMidnightUtc)).to.be.false; // local Saturday begins
    });

    it('should not affect the weekday check with offset zero (UTC day == local day)', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await enabledAllHours(tradingHours, SAT_SUN_MASK, 0);

      expect(await tradingHours.isTradingAllowed(SATURDAY - 1)).to.be.true; // Friday 23:59:59
      expect(await tradingHours.isTradingAllowed(SATURDAY)).to.be.false;
    });
  });

  describe('Blocked windows', function () {
    it('should block inside a window (inclusive start, exclusive end) and allow outside it', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);
      await tradingHours.setBlockedWindow(MONDAY, 0, 10 * 3600, 12 * 3600);

      expect(await tradingHours.isTradingAllowed(MONDAY + 10 * 3600 - 1)).to.be.true;
      expect(await tradingHours.isTradingAllowed(MONDAY + 10 * 3600)).to.be.false;
      expect(await tradingHours.isTradingAllowed(MONDAY + 11 * 3600)).to.be.false;
      expect(await tradingHours.isTradingAllowed(MONDAY + 12 * 3600 - 1)).to.be.false;
      expect(await tradingHours.isTradingAllowed(MONDAY + 12 * 3600)).to.be.true;
    });

    it('should support multiple non-overlapping windows on the same day', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);
      await tradingHours.setBlockedWindow(MONDAY, 0, 8 * 3600, 9 * 3600);
      await tradingHours.setBlockedWindow(MONDAY, 1, 17 * 3600, 18 * 3600);

      expect(await tradingHours.isTradingAllowed(MONDAY + 8 * 3600 + 1800)).to.be.false; // inside window 0
      expect(await tradingHours.isTradingAllowed(MONDAY + 12 * 3600)).to.be.true; // gap between windows
      expect(await tradingHours.isTradingAllowed(MONDAY + 17 * 3600 + 1800)).to.be.false; // inside window 1
    });

    it('should reach the last slot (index 4) when all 5 are populated', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);
      for (let i = 0; i < 5; i++) {
        await tradingHours.setBlockedWindow(MONDAY, i, i * 3600 + 100, i * 3600 + 200);
      }

      expect(await tradingHours.isTradingAllowed(MONDAY + 4 * 3600 + 150)).to.be.false; // inside slot 4
      expect(await tradingHours.isTradingAllowed(MONDAY + 4 * 3600 + 250)).to.be.true; // just after slot 4
    });

    it('should stop scanning at the first empty slot, making a later populated slot unreachable', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);

      // slot 0 populated, slot 1 left empty, slot 2 populated
      await tradingHours.setBlockedWindow(MONDAY, 0, 1 * 3600, 2 * 3600);
      await tradingHours.setBlockedWindow(MONDAY, 2, 10 * 3600, 11 * 3600);

      expect(await tradingHours.isTradingAllowed(MONDAY + 1 * 3600 + 100)).to.be.false; // slot 0 still checked
      // slot 2's window is never reached because the scan breaks at empty slot 1 first
      expect(await tradingHours.isTradingAllowed(MONDAY + 10 * 3600 + 100)).to.be.true;
    });

    it('should stop reading a slot once cleared, hiding any later populated slot the same way', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);

      await tradingHours.setBlockedWindow(MONDAY, 0, 1 * 3600, 2 * 3600);
      await tradingHours.setBlockedWindow(MONDAY, 1, 10 * 3600, 11 * 3600);
      expect(await tradingHours.isTradingAllowed(MONDAY + 10 * 3600 + 100)).to.be.false;

      await tradingHours.setBlockedWindow(MONDAY, 0, 0, 0); // clear slot 0
      expect(await tradingHours.isTradingAllowed(MONDAY + 1 * 3600 + 100)).to.be.true; // slot 0 no longer blocks
      expect(await tradingHours.isTradingAllowed(MONDAY + 10 * 3600 + 100)).to.be.true; // slot 1 unreachable now
    });

    it('should revert with InvalidBlockedWindowIndex when index >= 5', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await expect(tradingHours.setBlockedWindow(MONDAY, 5, 100, 200)).to.be.revertedWithCustomError(
        tradingHours,
        'InvalidBlockedWindowIndex'
      );
    });

    it('should revert with InvalidBlockedWindowRange when start >= end and it is not the clearing sentinel', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await expect(tradingHours.setBlockedWindow(MONDAY, 0, 200, 200)).to.be.revertedWithCustomError(
        tradingHours,
        'InvalidBlockedWindowRange'
      );
      await expect(tradingHours.setBlockedWindow(MONDAY, 0, 300, 200)).to.be.revertedWithCustomError(
        tradingHours,
        'InvalidBlockedWindowRange'
      );
    });

    it('should allow (0, 0) as a no-op clearing sentinel even with no prior window', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await expect(tradingHours.setBlockedWindow(MONDAY, 0, 0, 0)).to.not.be.reverted;
    });

    it('should normalize any timestamp within a day to the same blocked-window key', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      const noon = MONDAY + 12 * 3600;
      const lateNight = MONDAY + 23 * 3600 + 3599;

      await tradingHours.setBlockedWindow(noon, 0, 1000, 2000);
      const [start, end] = await tradingHours.getBlockedWindow(lateNight, 0);
      expect(start).to.equal(1000);
      expect(end).to.equal(2000);
    });

    it('should not let a window leak into the previous or next UTC day', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);
      await tradingHours.setBlockedWindow(MONDAY, 0, 0, SECONDS_PER_DAY); // block all of Monday

      expect(await tradingHours.isTradingAllowed(MONDAY - 1)).to.be.true; // last second of Sunday
      expect(await tradingHours.isTradingAllowed(MONDAY)).to.be.false; // first second of Monday
      expect(await tradingHours.isTradingAllowed(MONDAY + SECONDS_PER_DAY - 1)).to.be.false; // last second of Monday
      expect(await tradingHours.isTradingAllowed(MONDAY + SECONDS_PER_DAY)).to.be.true; // first second of Tuesday
    });
  });

  describe('setBlockedWindows (batch)', function () {
    it('should apply entries across different days in one call', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);

      await tradingHours.setBlockedWindows([
        { day: MONDAY, index: 0, ...packWindow(1000, 2000) },
        { day: TUESDAY, index: 0, ...packWindow(3000, 4000) },
      ]);

      expect(await tradingHours.isTradingAllowed(MONDAY + 1500)).to.be.false;
      expect(await tradingHours.isTradingAllowed(TUESDAY + 3500)).to.be.false;
      expect(await tradingHours.isTradingAllowed(MONDAY + 3500)).to.be.true; // window 3000-4000 doesn't apply to Monday
    });

    it('should accumulate multiple entries for the same day in one call', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);

      await tradingHours.setBlockedWindows([
        { day: MONDAY, index: 0, ...packWindow(1000, 2000) },
        { day: MONDAY, index: 1, ...packWindow(5000, 6000) },
      ]);

      expect(await tradingHours.isTradingAllowed(MONDAY + 1500)).to.be.false;
      expect(await tradingHours.isTradingAllowed(MONDAY + 5500)).to.be.false;
      expect(await tradingHours.isTradingAllowed(MONDAY + 3000)).to.be.true;
    });

    it('should revert the entire batch if one entry is invalid', async function () {
      const { tradingHours } = await loadFixture(deployFixture);

      await expect(
        tradingHours.setBlockedWindows([
          { day: MONDAY, index: 0, ...packWindow(1000, 2000) },
          { day: TUESDAY, index: 5, ...packWindow(3000, 4000) }, // invalid index
        ])
      ).to.be.revertedWithCustomError(tradingHours, 'InvalidBlockedWindowIndex');

      // first entry must not have persisted either
      const [start, end] = await tradingHours.getBlockedWindow(MONDAY, 0);
      expect(start).to.equal(0);
      expect(end).to.equal(0);
    });
  });

  describe('Day-of-week offset independence from hours and blocked windows', function () {
    it('should not shift the trading-hours boundary', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(9 * 3600, 18 * 3600);
      await tradingHours.setDayOfWeekOffset(12 * 3600); // large offset, weekday check only
      await tradingHours.setEnabled(true);

      // hours check must still use raw UTC seconds-of-day, unaffected by the offset
      const start = MONDAY + 9 * 3600;
      expect(await tradingHours.isTradingAllowed(start - 1)).to.be.false;
      expect(await tradingHours.isTradingAllowed(start)).to.be.true;
    });

    it('should not shift which UTC day a blocked window applies to', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setDayOfWeekOffset(20 * 3600); // large offset
      await tradingHours.setEnabled(true);
      await tradingHours.setBlockedWindow(MONDAY, 0, 1000, 2000);

      // the window must still be read back at Monday's own UTC key, not shifted by the offset
      expect(await tradingHours.isTradingAllowed(MONDAY + 1500)).to.be.false;
      expect(await tradingHours.isTradingAllowed(TUESDAY + 1500)).to.be.true;
    });
  });

  describe('verifyTrading', function () {
    it('should not revert when trading is allowed', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setBlockedWeekdays(0);
      await tradingHours.setEnabled(true);

      await expect(tradingHours.verifyTrading()).to.not.be.reverted;
    });

    it('should revert with TradingNotAllowed when every day is blocked', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setBlockedWeekdays(ALL_DAYS_MASK);
      await tradingHours.setEnabled(true);

      await expect(tradingHours.verifyTrading()).to.be.revertedWithCustomError(tradingHours, 'TradingNotAllowed');
    });
  });

  describe('Fuzz: isTradingAllowed matches a JS reference model', function () {
    // Deterministic seeded PRNG (mulberry32) so failures are reproducible without relying on Mocha's own seed.
    function mulberry32(seed: number) {
      return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function referenceIsTradingAllowed(
      timestamp: number,
      start: number,
      end: number,
      offset: number,
      mask: number,
      windowDay: number,
      windowStart: number,
      windowEnd: number
    ): boolean {
      const secondsInDay = timestamp % SECONDS_PER_DAY;
      if (secondsInDay < start || secondsInDay >= end) return false;

      const dayCount = Math.floor((timestamp + offset) / SECONDS_PER_DAY);
      const dayOfWeek = ((dayCount % 7) + 11) % 7; // (dayCount + 4) % 7, safe for negative dayCount
      if ((mask >> dayOfWeek) & 1) return false;

      const dayStart = Math.floor(timestamp / SECONDS_PER_DAY) * SECONDS_PER_DAY;
      if (dayStart === windowDay && secondsInDay >= windowStart && secondsInDay < windowEnd) return false;

      return true;
    }

    it('should match the reference model across many randomized configurations', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      const rand = mulberry32(1337);
      const baseDay = utc(2024, 1, 1);
      const iterations = 40; // each iteration reconfigures the contract (several writes), keep CI-friendly

      for (let i = 0; i < iterations; i++) {
        const start = Math.floor(rand() * SECONDS_PER_DAY);
        const end = start + 1 + Math.floor(rand() * (SECONDS_PER_DAY - start));
        const offset = Math.floor(rand() * 172800) - 86400; // -1 day .. +1 day
        const mask = Math.floor(rand() * 128);
        const dayOffset = Math.floor(rand() * 14) * SECONDS_PER_DAY;
        const windowDay = baseDay + dayOffset;
        const windowStart = Math.floor(rand() * SECONDS_PER_DAY);
        const windowEnd = windowStart + 1 + Math.floor(rand() * (SECONDS_PER_DAY - windowStart));

        await tradingHours.setTradingHours(start, end);
        await tradingHours.setDayOfWeekOffset(offset);
        await tradingHours.setBlockedWeekdays(mask);
        await tradingHours.setBlockedWindow(windowDay, 0, windowStart, windowEnd);
        await tradingHours.setEnabled(true);

        for (let j = 0; j < 5; j++) {
          const timestamp = baseDay + Math.floor(rand() * 14 * SECONDS_PER_DAY);
          const expected = referenceIsTradingAllowed(timestamp, start, end, offset, mask, windowDay, windowStart, windowEnd);
          const actual = await tradingHours.isTradingAllowed(timestamp);
          expect(actual, `timestamp=${timestamp} start=${start} end=${end} offset=${offset} mask=${mask}`).to.equal(
            expected
          );
        }

        // clear the window so the next iteration starts clean
        await tradingHours.setBlockedWindow(windowDay, 0, 0, 0);
      }
    });

    it('should match the reference model across many timestamps against one fixed configuration', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      const rand = mulberry32(2024);
      const start = 8 * 3600;
      const end = 20 * 3600;
      const offset = -4 * 3600;
      const mask = SAT_SUN_MASK;
      const baseDay = utc(2024, 1, 1);

      await tradingHours.setTradingHours(start, end);
      await tradingHours.setDayOfWeekOffset(offset);
      await tradingHours.setBlockedWeekdays(mask);
      await tradingHours.setEnabled(true);

      for (let i = 0; i < 300; i++) {
        const timestamp = baseDay + Math.floor(rand() * 30 * SECONDS_PER_DAY);
        const expected = referenceIsTradingAllowed(timestamp, start, end, offset, mask, -1, 0, 0);
        const actual = await tradingHours.isTradingAllowed(timestamp);
        expect(actual, `timestamp=${timestamp}`).to.equal(expected);
      }
    });
  });
});
