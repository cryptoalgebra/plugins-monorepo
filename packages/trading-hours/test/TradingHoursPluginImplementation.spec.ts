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

// Shorthand for the BlockedWindowInput struct literal the batch setter takes
function windowInput(startSeconds: number, endSeconds: number): { startSeconds: number; endSeconds: number } {
  return { startSeconds, endSeconds };
}

const SLOT_COUNT = 5;

describe('TradingHoursPluginImplementation', function () {
  async function deployFixture() {
    const TradingHoursPluginImplementation = await ethers.getContractFactory('TradingHoursPluginImplementation');
    const tradingHours = await TradingHoursPluginImplementation.deploy();

    const TradingHoursLibTest = await ethers.getContractFactory('TradingHoursLibTest');
    const lib = await TradingHoursLibTest.deploy();

    return { tradingHours, lib };
  }

  describe('Library constants', function () {
    it('should agree with the values the specs hardcode', async function () {
      const { lib } = await loadFixture(deployFixture);
      // The library's constants are internal, so every case below writes 86400 and loops to five by
      // hand. This is what turns a retuned constant into a failure instead of a silently narrower suite.
      expect(await lib.secondsPerDay()).to.equal(SECONDS_PER_DAY);
      expect(await lib.maxBlockedWindowsPerDay()).to.equal(SLOT_COUNT);
    });
  });

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

    it('should block everything when enabled with hours still at their zero default', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      // Only reachable on a standalone implementation: initializeTradingHours validates the window, so
      // a plugin can never be enabled in this state. Pinned here so that guarantee stays visible.
      await tradingHours.setEnabled(true);

      expect(await tradingHours.isTradingAllowed(MONDAY)).to.be.false;
      expect(await tradingHours.isTradingAllowed(MONDAY + 12 * 3600)).to.be.false;
    });

    it('should accept setEnabled twice with the same value', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);

      await tradingHours.setEnabled(true);
      await expect(tradingHours.setEnabled(true)).to.not.be.reverted;
      expect(await tradingHours.getEnabled()).to.be.true;

      await tradingHours.setEnabled(false);
      await expect(tradingHours.setEnabled(false)).to.not.be.reverted;
      expect(await tradingHours.getEnabled()).to.be.false;
    });

    it('should accept a setter call that changes nothing', async function () {
      const { tradingHours } = await loadFixture(deployFixture);

      await tradingHours.setTradingHours(9 * 3600, 18 * 3600);
      await expect(tradingHours.setTradingHours(9 * 3600, 18 * 3600)).to.not.be.reverted;
      await tradingHours.setBlockedWeekdays(SAT_SUN_MASK);
      await expect(tradingHours.setBlockedWeekdays(SAT_SUN_MASK)).to.not.be.reverted;
      await expect(tradingHours.setDayOfWeekOffset(0)).to.not.be.reverted;

      const [start, end] = await tradingHours.getTradingHours();
      expect([start, end]).to.deep.equal([BigInt(9 * 3600), BigInt(18 * 3600)]);
      expect(await tradingHours.getBlockedWeekdays()).to.equal(SAT_SUN_MASK);
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

    it('should accept the extreme int32 offsets the setter does not bound', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      // setDayOfWeekOffset takes any int32, roughly plus or minus 68 years, so a misconfigured pool can
      // land far outside any real timezone. Nothing reverts; the weekday simply comes from a shifted
      // calendar, which is what these pin.
      const INT32_MAX = 2 ** 31 - 1;
      const INT32_MIN = -(2 ** 31);

      await enabledAllHours(tradingHours, ALL_DAYS_MASK, INT32_MAX);
      expect(await tradingHours.getDayOfWeekOffset()).to.equal(INT32_MAX);
      expect(await tradingHours.isTradingAllowed(MONDAY)).to.be.false; // every weekday blocked either way

      await tradingHours.setDayOfWeekOffset(INT32_MIN);
      expect(await tradingHours.getDayOfWeekOffset()).to.equal(INT32_MIN);
      expect(await tradingHours.isTradingAllowed(MONDAY)).to.be.false;
    });

    it('should shift the weekday by exactly one day at an offset of one day', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await enabledAllHours(tradingHours, 1 << 1, SECONDS_PER_DAY); // block Monday, local = UTC + 1 day

      // with the calendar pushed a day forward, UTC Sunday is local Monday
      expect(await tradingHours.isTradingAllowed(SUNDAY)).to.be.false;
      expect(await tradingHours.isTradingAllowed(MONDAY)).to.be.true;
    });

    it('should wrap rather than revert when a negative offset takes local time below zero', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      // localTimestamp reinterprets int256 as uint256, so a local time before the epoch becomes a huge
      // number instead of reverting. Reachable only with a timestamp near zero, which no live pool sees,
      // but the setter permits the configuration so the behavior is pinned rather than assumed.
      await enabledAllHours(tradingHours, ALL_DAYS_MASK, -SECONDS_PER_DAY);

      // every weekday is blocked, so whichever weekday the wrap lands on the answer is still false
      expect(await tradingHours.isTradingAllowed(0)).to.be.false;

      // and with no weekday blocked the wrap cannot change the answer either
      await tradingHours.setBlockedWeekdays(0);
      expect(await tradingHours.isTradingAllowed(0)).to.be.true;
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

    it('should read every one of the five slots back exactly as written', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      for (let i = 0; i < 5; i++) {
        await tradingHours.setBlockedWindow(MONDAY, i, i * 3600 + 100, i * 3600 + 200);
      }

      for (let i = 0; i < 5; i++) {
        const [start, end] = await tradingHours.getBlockedWindow(MONDAY, i);
        expect([start, end], `slot ${i}`).to.deep.equal([BigInt(i * 3600 + 100), BigInt(i * 3600 + 200)]);
      }
    });

    it('should leave the neighbouring slots untouched when one is overwritten', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      for (let i = 0; i < 5; i++) {
        await tradingHours.setBlockedWindow(MONDAY, i, i * 3600 + 100, i * 3600 + 200);
      }

      await tradingHours.setBlockedWindow(MONDAY, 2, 77777, 88888);

      const [start2, end2] = await tradingHours.getBlockedWindow(MONDAY, 2);
      expect([start2, end2]).to.deep.equal([77777n, 88888n]);
      for (const i of [0, 1, 3, 4]) {
        const [start, end] = await tradingHours.getBlockedWindow(MONDAY, i);
        expect([start, end], `slot ${i}`).to.deep.equal([BigInt(i * 3600 + 100), BigInt(i * 3600 + 200)]);
      }
    });

    it('should return an empty window for an index past the last slot', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setBlockedWindow(MONDAY, 4, 100, 200);

      // the setter rejects index 5, the getter shifts past the packed slots and answers zeros instead
      await expect(tradingHours.setBlockedWindow(MONDAY, 5, 100, 200)).to.be.revertedWithCustomError(
        tradingHours,
        'InvalidBlockedWindowIndex'
      );
      const [start, end] = await tradingHours.getBlockedWindow(MONDAY, 5);
      expect([start, end]).to.deep.equal([0n, 0n]);
      const [farStart, farEnd] = await tradingHours.getBlockedWindow(MONDAY, 255);
      expect([farStart, farEnd]).to.deep.equal([0n, 0n]);
    });

    it('should accept a window ending past the end of a day and block the whole day with it', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);

      // endSeconds is a uint24 and nothing bounds it to a day, unlike setTradingHours
      const UINT24_MAX = 2 ** 24 - 1;
      await tradingHours.setBlockedWindow(MONDAY, 0, 0, UINT24_MAX);

      expect(await tradingHours.isTradingAllowed(MONDAY)).to.be.false;
      expect(await tradingHours.isTradingAllowed(MONDAY + SECONDS_PER_DAY - 1)).to.be.false;
      expect(await tradingHours.isTradingAllowed(TUESDAY)).to.be.true; // still keyed to Monday only
    });

    it('should accept a window that starts past the end of a day and never match it', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);

      // seconds-of-day never reaches 100000, so this slot is occupied but unreachable - and it still
      // shadows every later slot, because the scan only stops at an empty one
      await tradingHours.setBlockedWindow(MONDAY, 0, 100000, 200000);
      await tradingHours.setBlockedWindow(MONDAY, 1, 3600, 7200);

      expect(await tradingHours.isTradingAllowed(MONDAY + 150000 - SECONDS_PER_DAY)).to.be.true;
      expect(await tradingHours.isTradingAllowed(MONDAY + 5000)).to.be.false; // slot 1 is still scanned
    });

    it('should simply shorten the scan when the last populated slot is cleared', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);
      for (let i = 0; i < 3; i++) {
        await tradingHours.setBlockedWindow(MONDAY, i, i * 3600 + 100, i * 3600 + 200);
      }

      // clearing the last one has no slot behind it to shadow, unlike clearing slot 0
      await tradingHours.setBlockedWindow(MONDAY, 2, 0, 0);

      expect(await tradingHours.isTradingAllowed(MONDAY + 150)).to.be.false; // slot 0 still blocks
      expect(await tradingHours.isTradingAllowed(MONDAY + 3600 + 150)).to.be.false; // slot 1 still blocks
      expect(await tradingHours.isTradingAllowed(MONDAY + 7200 + 150)).to.be.true; // slot 2 is gone
    });

    it('should block the union of two overlapping windows', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);
      await tradingHours.setBlockedWindow(MONDAY, 0, 10 * 3600, 12 * 3600);
      await tradingHours.setBlockedWindow(MONDAY, 1, 11 * 3600, 13 * 3600);

      expect(await tradingHours.isTradingAllowed(MONDAY + 10 * 3600 - 1)).to.be.true; // before both
      expect(await tradingHours.isTradingAllowed(MONDAY + 10 * 3600)).to.be.false; // first only
      expect(await tradingHours.isTradingAllowed(MONDAY + 11 * 3600 + 1800)).to.be.false; // both
      expect(await tradingHours.isTradingAllowed(MONDAY + 12 * 3600 + 1800)).to.be.false; // second only
      expect(await tradingHours.isTradingAllowed(MONDAY + 13 * 3600)).to.be.true; // after both
    });

    it('should block a one-second window only at that exact second', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);
      await tradingHours.setBlockedWindow(MONDAY, 0, 43200, 43201);

      expect(await tradingHours.isTradingAllowed(MONDAY + 43199)).to.be.true;
      expect(await tradingHours.isTradingAllowed(MONDAY + 43200)).to.be.false;
      expect(await tradingHours.isTradingAllowed(MONDAY + 43201)).to.be.true;
    });

    it('should apply the hours and the window rules together', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      // every other window case opens the day whole, so the two rules are only ever combined by the
      // fuzz. Here the window straddles the close, and each boundary belongs to a different rule.
      await tradingHours.setTradingHours(9 * 3600, 18 * 3600);
      await tradingHours.setEnabled(true);
      await tradingHours.setBlockedWindow(MONDAY, 0, 17 * 3600, 19 * 3600);

      expect(await tradingHours.isTradingAllowed(MONDAY + 16 * 3600)).to.be.true; // inside hours, before the window
      expect(await tradingHours.isTradingAllowed(MONDAY + 17 * 3600 - 1)).to.be.true; // last second before the window
      expect(await tradingHours.isTradingAllowed(MONDAY + 17 * 3600)).to.be.false; // the window closes it early
      expect(await tradingHours.isTradingAllowed(MONDAY + 18 * 3600)).to.be.false; // now both rules block
      expect(await tradingHours.isTradingAllowed(MONDAY + 19 * 3600)).to.be.false; // window over, hours still closed
    });
  });

  describe('setBlockedWindows (batch)', function () {
    it('should apply entries across different days in one call', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);

      await tradingHours.setBlockedWindows([
        { day: MONDAY, index: 0, ...windowInput(1000, 2000) },
        { day: TUESDAY, index: 0, ...windowInput(3000, 4000) },
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
        { day: MONDAY, index: 0, ...windowInput(1000, 2000) },
        { day: MONDAY, index: 1, ...windowInput(5000, 6000) },
      ]);

      expect(await tradingHours.isTradingAllowed(MONDAY + 1500)).to.be.false;
      expect(await tradingHours.isTradingAllowed(MONDAY + 5500)).to.be.false;
      expect(await tradingHours.isTradingAllowed(MONDAY + 3000)).to.be.true;
    });

    it('should revert the entire batch if one entry is invalid', async function () {
      const { tradingHours } = await loadFixture(deployFixture);

      await expect(
        tradingHours.setBlockedWindows([
          { day: MONDAY, index: 0, ...windowInput(1000, 2000) },
          { day: TUESDAY, index: 5, ...windowInput(3000, 4000) }, // invalid index
        ])
      ).to.be.revertedWithCustomError(tradingHours, 'InvalidBlockedWindowIndex');

      // first entry must not have persisted either
      const [start, end] = await tradingHours.getBlockedWindow(MONDAY, 0);
      expect(start).to.equal(0);
      expect(end).to.equal(0);
    });

    it('should accept an empty batch as a no-op', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setBlockedWindow(MONDAY, 0, 1000, 2000);

      await expect(tradingHours.setBlockedWindows([])).to.not.be.reverted;

      const [start, end] = await tradingHours.getBlockedWindow(MONDAY, 0);
      expect([start, end]).to.deep.equal([1000n, 2000n]);
    });

    it('should let the last entry win when a batch names the same slot twice', async function () {
      const { tradingHours } = await loadFixture(deployFixture);

      await tradingHours.setBlockedWindows([
        { day: MONDAY, index: 0, ...windowInput(1000, 2000) },
        { day: MONDAY + 12 * 3600, index: 0, ...windowInput(5000, 6000) }, // same day, same slot
      ]);

      const [start, end] = await tradingHours.getBlockedWindow(MONDAY, 0);
      expect([start, end]).to.deep.equal([5000n, 6000n]);
    });

    it('should overwrite a slot a single call had set', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);
      await tradingHours.setBlockedWindow(MONDAY, 0, 1000, 2000);

      await tradingHours.setBlockedWindows([{ day: MONDAY, index: 0, ...windowInput(5000, 6000) }]);

      expect(await tradingHours.isTradingAllowed(MONDAY + 1500)).to.be.true;
      expect(await tradingHours.isTradingAllowed(MONDAY + 5500)).to.be.false;
    });

    it('should clear slots through the batch with the (0, 0) sentinel', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);
      await tradingHours.setBlockedWindow(MONDAY, 0, 1000, 2000);
      await tradingHours.setBlockedWindow(TUESDAY, 0, 3000, 4000);

      await tradingHours.setBlockedWindows([
        { day: MONDAY, index: 0, ...windowInput(0, 0) },
        { day: TUESDAY, index: 0, ...windowInput(0, 0) },
      ]);

      expect(await tradingHours.isTradingAllowed(MONDAY + 1500)).to.be.true;
      expect(await tradingHours.isTradingAllowed(TUESDAY + 3500)).to.be.true;
    });

    it('should fill every slot of a day in one call', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);

      // the single setter is tested against a fully packed word, the batch path never was
      await tradingHours.setBlockedWindows(
        Array.from({ length: SLOT_COUNT }, (_, i) => ({ day: MONDAY, index: i, ...windowInput(i * 3600 + 100, i * 3600 + 200) }))
      );

      for (let i = 0; i < SLOT_COUNT; i++) {
        const [start, end] = await tradingHours.getBlockedWindow(MONDAY, i);
        expect([start, end], `slot ${i}`).to.deep.equal([BigInt(i * 3600 + 100), BigInt(i * 3600 + 200)]);
        expect(await tradingHours.isTradingAllowed(MONDAY + i * 3600 + 150), `inside slot ${i}`).to.be.false;
      }
      expect(await tradingHours.isTradingAllowed(MONDAY + 4 * 3600 + 250)).to.be.true;
    });

    it('should leave a hole that shadows the slots behind it', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setEnabled(true);

      // the batch does not enforce contiguity any more than the single setter does
      await tradingHours.setBlockedWindows([
        { day: MONDAY, index: 0, ...windowInput(1 * 3600, 2 * 3600) },
        { day: MONDAY, index: 2, ...windowInput(10 * 3600, 11 * 3600) },
      ]);

      expect(await tradingHours.isTradingAllowed(MONDAY + 1 * 3600 + 100)).to.be.false; // slot 0 is scanned
      expect(await tradingHours.isTradingAllowed(MONDAY + 10 * 3600 + 100)).to.be.true; // slot 2 is unreachable
      const [start, end] = await tradingHours.getBlockedWindow(MONDAY, 2);
      expect([start, end]).to.deep.equal([BigInt(10 * 3600), BigInt(11 * 3600)]); // stored all the same
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


  describe('Timestamp boundaries', function () {
    // isTradingAllowed is public and takes an unrestricted uint256, so the ends of that range are real
    // inputs even though no live pool produces them.
    function secondsOfDay(timestamp: bigint): number {
      return Number(timestamp % BigInt(SECONDS_PER_DAY));
    }

    it('should treat timestamp zero as the first second of a UTC day', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, 1);
      await tradingHours.setEnabled(true);

      expect(await tradingHours.isTradingAllowed(0)).to.be.true;
      expect(await tradingHours.isTradingAllowed(1)).to.be.false;
    });

    it('should place the maximum uint256 timestamp at its own second of the day', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      const maxTimestamp = 2n ** 256n - 1n;
      const second = secondsOfDay(maxTimestamp);

      await tradingHours.setTradingHours(second, second + 1);
      await tradingHours.setEnabled(true);
      expect(await tradingHours.isTradingAllowed(maxTimestamp)).to.be.true;

      await tradingHours.setTradingHours(0, second);
      expect(await tradingHours.isTradingAllowed(maxTimestamp)).to.be.false;
    });

    it('should still apply the weekday mask at the maximum uint256 timestamp', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
      await tradingHours.setBlockedWeekdays(ALL_DAYS_MASK);
      await tradingHours.setEnabled(true);

      expect(await tradingHours.isTradingAllowed(2n ** 256n - 1n)).to.be.false;
    });

    it('should keep checking hours past the last day setBlockedWindow can address', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      // `day` is a uint32, so no blocked window can be set for a day after early 2106, but the daily
      // hours and the weekday mask keep applying to timestamps beyond it
      const farFuture = 2n ** 33n; // year 2242
      const second = secondsOfDay(farFuture);

      await tradingHours.setTradingHours(second, second + 1);
      await tradingHours.setEnabled(true);
      expect(await tradingHours.isTradingAllowed(farFuture)).to.be.true;
      expect(await tradingHours.isTradingAllowed(farFuture + 1n)).to.be.false;
    });
  });

  describe('Fuzz: isTradingAllowed matches a JS reference model', function () {
    // Widen by hand when hunting something (FUZZ_RUNS=2000 npx hardhat test test/...), never by raising
    // the committed default. The seed is pinned so a failure reproduces on someone else's machine.
    const fuzz = {
      seed: Number(process.env.FUZZ_SEED ?? 20260904),
      configs: Number(process.env.FUZZ_RUNS ?? 40),
      sequences: Number(process.env.FUZZ_SEQUENCES ?? 25),
    };

    this.timeout(180000);

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

    interface Config {
      start: number;
      end: number;
      offset: number;
      mask: number;
      windowDay: number;
      windowStart: number;
      windowEnd: number;
    }

    // The weekday comes from the JS calendar rather than from a second copy of the library's
    // (dayCount + 4) % 7, so a wrong epoch anchor in TradingHoursLib would show up here instead of
    // being reproduced by the model. Only valid while local time stays positive, which the generator
    // guarantees; the wrap below zero is pinned by a case of its own in "Blocked weekdays".
    function referenceIsTradingAllowed(timestamp: number, c: Config): boolean {
      const secondsInDay = timestamp % SECONDS_PER_DAY;
      if (secondsInDay < c.start || secondsInDay >= c.end) return false;

      const localWeekday = new Date((timestamp + c.offset) * 1000).getUTCDay(); // 0 = Sunday
      if ((c.mask >> localWeekday) & 1) return false;

      const day = Math.floor(timestamp / SECONDS_PER_DAY) * SECONDS_PER_DAY;
      if (day === c.windowDay && secondsInDay >= c.windowStart && secondsInDay < c.windowEnd) return false;

      return true;
    }

    // Everything the contract checks is a guard that returns early, so probes drawn uniformly over a
    // fortnight mostly die at the hours check and never reach the window scan. These straddle each
    // threshold on purpose, and the counters below fail if a change to the generator stops feeding one.
    function probesFor(c: Config, baseDay: number, rand: () => number): number[] {
      const clamp = (second: number) => Math.max(0, Math.min(SECONDS_PER_DAY - 1, second));
      return [
        c.windowDay + clamp(c.start - 1),
        c.windowDay + c.start,
        c.windowDay + clamp(c.end - 1),
        c.windowDay + clamp(c.end),
        c.windowDay + clamp(c.windowStart - 1),
        c.windowDay + c.windowStart,
        c.windowDay + clamp(c.windowEnd),
        baseDay + Math.floor(rand() * 14 * SECONDS_PER_DAY),
      ];
    }

    function drawConfig(rand: () => number, baseDay: number): Config {
      const start = Math.floor(rand() * (SECONDS_PER_DAY - 1));
      const end = start + 1 + Math.floor(rand() * (SECONDS_PER_DAY - start));
      const windowStart = Math.floor(rand() * (SECONDS_PER_DAY - 1));
      const windowEnd = windowStart + 1 + Math.floor(rand() * (SECONDS_PER_DAY - windowStart));
      return {
        start,
        end,
        offset: Math.floor(rand() * 172800) - 86400, // -1 day .. +1 day
        // an all-zero mask often enough that the weekday guard does not swallow most of the probes
        mask: rand() < 0.4 ? 0 : Math.floor(rand() * 128),
        windowDay: baseDay + Math.floor(rand() * 14) * SECONDS_PER_DAY,
        windowStart,
        windowEnd,
      };
    }

    it('should match the reference model across randomized configurations', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      const rand = mulberry32(fuzz.seed);
      const baseDay = utc(2024, 1, 1);

      let reachedWindowScan = 0;
      let blockedByWindow = 0;
      let allowed = 0;
      let disabledChecks = 0;

      for (let i = 0; i < fuzz.configs; i++) {
        const c = drawConfig(rand, baseDay);

        await tradingHours.setTradingHours(c.start, c.end);
        await tradingHours.setDayOfWeekOffset(c.offset);
        await tradingHours.setBlockedWeekdays(c.mask);
        await tradingHours.setBlockedWindow(c.windowDay, 0, c.windowStart, c.windowEnd);
        await tradingHours.setEnabled(true);

        let firstBlocked = -1;
        for (const timestamp of probesFor(c, baseDay, rand)) {
          const expected = referenceIsTradingAllowed(timestamp, c);
          const actual = await tradingHours.isTradingAllowed(timestamp);
          expect(actual, `timestamp=${timestamp} config=${JSON.stringify(c)}`).to.equal(expected);

          // classify the probe the same way the contract does, to see which guards it got past
          const secondsInDay = timestamp % SECONDS_PER_DAY;
          const pastHours = secondsInDay >= c.start && secondsInDay < c.end;
          const pastWeekday = pastHours && !((c.mask >> new Date((timestamp + c.offset) * 1000).getUTCDay()) & 1);
          if (pastWeekday) reachedWindowScan++;
          if (pastWeekday && !expected) blockedByWindow++;
          if (expected) allowed++;
          if (!expected && firstBlocked < 0) firstBlocked = timestamp;
        }

        // whatever blocked that probe, disabling the module has to lift it
        if (firstBlocked >= 0) {
          await tradingHours.setEnabled(false);
          expect(await tradingHours.isTradingAllowed(firstBlocked), `disabled at ${firstBlocked}`).to.be.true;
          disabledChecks++;
        }

        await tradingHours.setBlockedWindow(c.windowDay, 0, 0, 0);
      }

      // Floors, not decoration. Drawing probes uniformly over a fortnight reached the window scan on
      // 22 of 200 draws and was blocked by a window exactly once, so a property that looked healthy was
      // barely testing the slot logic. Aiming the probes at each guard puts these at 71-106, 19-30 and
      // 43-76 across seven seeds, and the floors sit below the worst of them, expressed per config so
      // they still hold when FUZZ_RUNS is raised.
      expect(reachedWindowScan, 'probes that got past the hours and weekday guards').to.be.greaterThan(fuzz.configs * 1.5);
      expect(blockedByWindow, 'probes blocked by a blocked window').to.be.greaterThan(fuzz.configs * 0.3);
      expect(allowed, 'probes the contract allowed').to.be.greaterThan(fuzz.configs * 0.75);
      expect(disabledChecks, 'configurations where disabling was checked').to.be.greaterThan(fuzz.configs * 0.5);
    });

    it('should match the reference model across many timestamps against one fixed configuration', async function () {
      const { tradingHours } = await loadFixture(deployFixture);
      const rand = mulberry32(fuzz.seed + 1);
      const c: Config = {
        start: 8 * 3600,
        end: 20 * 3600,
        offset: -4 * 3600,
        mask: SAT_SUN_MASK,
        windowDay: -1, // no window on any real day
        windowStart: 0,
        windowEnd: 0,
      };
      const baseDay = utc(2024, 1, 1);

      await tradingHours.setTradingHours(c.start, c.end);
      await tradingHours.setDayOfWeekOffset(c.offset);
      await tradingHours.setBlockedWeekdays(c.mask);
      await tradingHours.setEnabled(true);

      let allowed = 0;
      for (let i = 0; i < 300; i++) {
        const timestamp = baseDay + Math.floor(rand() * 30 * SECONDS_PER_DAY);
        const expected = referenceIsTradingAllowed(timestamp, c);
        const actual = await tradingHours.isTradingAllowed(timestamp);
        expect(actual, `timestamp=${timestamp}`).to.equal(expected);
        if (expected) allowed++;
      }

      // a run that answered one way for every draw would pass vacuously against a stuck implementation
      expect(allowed, 'timestamps inside the window').to.be.greaterThan(30);
      expect(allowed, 'timestamps outside the window').to.be.lessThan(270);
    });

    it('should match a packed-word model across random window write sequences', async function () {
      // The two properties above only ever write slot 0, so the packing itself - five 48-bit lanes in
      // one word, the mask and shift in packBlockedWindow, the break on the first empty lane - is left
      // to the hand-written cases. This one drives whole days through sequences of writes, overwrites
      // and clears, in both the single-setter and the batch path, against a model of the packed word.
      const rand = mulberry32(fuzz.seed + 2);
      const baseDay = utc(2024, 1, 1);
      // two days, and most writes aimed at one of them: spreading a short sequence over more days
      // never saturates any of them, and a day that never fills leaves the last lane untested
      const days = [baseDay, baseDay + SECONDS_PER_DAY];
      const clamp = (second: number) => Math.max(0, Math.min(SECONDS_PER_DAY - 1, second));

      interface Slot {
        start: number;
        end: number;
      }
      const isEmpty = (slot: Slot) => slot.start === 0 && slot.end === 0;
      const emptyDay = (): Slot[] => Array.from({ length: SLOT_COUNT }, () => ({ start: 0, end: 0 }));

      function modelAllowed(slots: Slot[], secondsInDay: number): boolean {
        for (const slot of slots) {
          if (isEmpty(slot)) break; // a zero lane ends the scan, so a hole hides everything behind it
          if (secondsInDay >= slot.start && secondsInDay < slot.end) return false;
        }
        return true;
      }

      let overwrites = 0;
      let clears = 0;
      let fullDays = 0;
      let blockedByHigherSlot = 0;

      for (let sequence = 0; sequence < fuzz.sequences; sequence++) {
        // reload rather than carry state over: a saturated day would stop the generator finding new shapes
        const { tradingHours } = await loadFixture(deployFixture);
        await tradingHours.setTradingHours(0, SECONDS_PER_DAY);
        await tradingHours.setBlockedWeekdays(0);
        await tradingHours.setEnabled(true);

        const model = new Map(days.map((day) => [day, emptyDay()]));
        const ops: { day: number; index: number; startSeconds: number; endSeconds: number }[] = [];
        const focusDay = days[sequence % days.length];

        // hoisted on purpose: a rand() call in the loop condition would be re-evaluated every iteration
        const opCount = 3 + Math.floor(rand() * 10);

        for (let i = 0; i < opCount; i++) {
          const day = rand() < 0.75 ? focusDay : days[Math.floor(rand() * days.length)];
          const slots = model.get(day)!;
          const firstEmpty = slots.findIndex(isEmpty);
          const populatedCount = firstEmpty === -1 ? SLOT_COUNT : firstEmpty;

          const roll = rand();
          let index: number;
          if (roll < 0.65) index = Math.min(populatedCount, SLOT_COUNT - 1); // extend the day contiguously
          else if (roll < 0.9 && populatedCount > 0) index = Math.floor(rand() * populatedCount); // land on a used slot
          else index = Math.floor(rand() * SLOT_COUNT); // anywhere, holes included

          let start = 0;
          let end = 0;
          if (rand() >= 0.12) {
            start = Math.floor(rand() * (SECONDS_PER_DAY - 1));
            end = start + 1 + Math.floor(rand() * Math.min(4 * 3600, SECONDS_PER_DAY - start));
          }

          if (!isEmpty(slots[index])) {
            if (start === 0 && end === 0) clears++;
            else overwrites++;
          }
          slots[index] = { start, end };
          ops.push({ day, index, startSeconds: start, endSeconds: end });
        }

        if (rand() < 0.5) await tradingHours.setBlockedWindows(ops);
        else for (const op of ops) await tradingHours.setBlockedWindow(op.day, op.index, op.startSeconds, op.endSeconds);

        for (const day of days) {
          const slots = model.get(day)!;
          if (slots.every((slot) => !isEmpty(slot))) fullDays++;

          for (let i = 0; i < SLOT_COUNT; i++) {
            const [start, end] = await tradingHours.getBlockedWindow(day, i);
            expect([Number(start), Number(end)], `day ${day} slot ${i}`).to.deep.equal([slots[i].start, slots[i].end]);
          }

          const probes = new Set<number>();
          for (const slot of slots) {
            if (isEmpty(slot)) continue;
            for (const second of [slot.start - 1, slot.start, slot.end - 1, slot.end]) probes.add(clamp(second));
          }
          probes.add(Math.floor(rand() * SECONDS_PER_DAY));
          probes.add(Math.floor(rand() * SECONDS_PER_DAY));

          const scanLimit = slots.findIndex(isEmpty) === -1 ? SLOT_COUNT : slots.findIndex(isEmpty);
          for (const second of probes) {
            const expected = modelAllowed(slots, second);
            expect(await tradingHours.isTradingAllowed(day + second), `day ${day} second ${second}`).to.equal(expected);
            if (!expected) {
              for (let i = 1; i < scanLimit; i++) {
                if (second >= slots[i].start && second < slots[i].end) {
                  blockedByHigherSlot++;
                  break;
                }
              }
            }
          }
        }
      }

      // Same reasoning as the floors above, and the same lesson: spread over three days with up to
      // eight writes this generator never once filled a day and cleared a populated slot on only two
      // seeds of seven. Concentrated on two days with up to twelve, seven seeds give 34-56 overwrites,
      // 4-10 clears, 4-12 saturated days and 143-205 probes blocked past the first lane. The floors sit
      // below the worst of those, per sequence so they survive a raised FUZZ_SEQUENCES.
      expect(overwrites, 'writes that landed on a populated slot').to.be.greaterThan(fuzz.sequences);
      expect(clears, 'writes that cleared a populated slot').to.be.greaterThan(fuzz.sequences * 0.1);
      expect(fullDays, 'days observed with all five slots populated').to.be.greaterThan(fuzz.sequences * 0.1);
      expect(blockedByHigherSlot, 'probes blocked by a slot past the first').to.be.greaterThan(fuzz.sequences * 4);
    });
  });
});
