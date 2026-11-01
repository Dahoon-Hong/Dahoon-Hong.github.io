namespace ProjectC.Core
{
    public enum MatchOutcome
    {
        Running,
        Victory,
        Defeat
    }

    public static class MatchRules
    {
        public static MatchOutcome Resolve(long departureMilliseconds, int cumulativeExportedCrystals, bool outpostDestroyed, GameDefinitions definitions = null)
        {
            definitions = definitions ?? GameDefinitions.Default;
            // EV-03: a same-time outpost loss takes precedence over the export goal.
            if (outpostDestroyed) return MatchOutcome.Defeat;

            // EV-01/02: goal settlement is based on actual departure and is strict at 3900 seconds.
            if (departureMilliseconds >= definitions.MatchDeadlineMilliseconds) return MatchOutcome.Defeat;
            if (departureMilliseconds < definitions.MatchDeadlineMilliseconds &&
                cumulativeExportedCrystals >= definitions.ExportGoal)
            {
                return MatchOutcome.Victory;
            }

            return MatchOutcome.Running;
        }
    }
}
