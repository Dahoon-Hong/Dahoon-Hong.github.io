using System.Collections.Generic;

namespace ProjectC.Core
{
    /// <summary>Produces one ore per game second from each completed miner.</summary>
    public sealed class MiningSystem
    {
        private readonly Dictionary<string, int> fractionalMilliseconds = new Dictionary<string, int>();

        public void Tick(GameWorld world, long currentMilliseconds, long elapsedMilliseconds)
        {
            if (world == null || elapsedMilliseconds <= 0) return;

            for (int i = 0; i < world.Facilities.Count; i++)
            {
                FacilityState facility = world.Facilities[i];
                if (facility.Kind != FacilityKind.Miner || facility.IsDestroyed || facility.IsUnderConstruction || facility.IsDemolishing) continue;

                fractionalMilliseconds.TryGetValue(facility.Id, out int remainder);
                long elapsed = remainder + elapsedMilliseconds;
                int mined = (int)(elapsed / 1_000);
                fractionalMilliseconds[facility.Id] = (int)(elapsed % 1_000);
                if (mined <= 0) continue;
                if (!facility.Inventory.TryAdd(ItemId.Ore, mined)) continue;
                world.Record(currentMilliseconds, "mining", facility.Id + ":ore:" + mined);
            }
        }

        internal void RemoveFacility(string facilityId) => fractionalMilliseconds.Remove(facilityId);
    }
}
