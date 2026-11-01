using System.Collections.Generic;

namespace ProjectC.Core
{
    /// <summary>Runs the two supplied production facilities using game time and reserved inputs.</summary>
    public sealed class ProductionSystem
    {
        private readonly Dictionary<string, MachineProgress> machines = new Dictionary<string, MachineProgress>();

        public MachineProgress GetProgress(string facilityId)
        {
            return machines.TryGetValue(facilityId, out MachineProgress progress) ? progress : MachineProgress.Empty;
        }

        internal void RemoveFacility(GameWorld world, string facilityId, bool recoverReservedInput = true)
        {
            if (world == null) throw new System.ArgumentNullException(nameof(world));
            if (!machines.TryGetValue(facilityId, out MachineProgress progress)) return;
            if (progress.ReservationId != null)
            {
                world.InventoryLedger.CancelReservation(progress.ReservationId);
                if (!recoverReservedInput)
                {
                    FacilityState facility = world.FindFacility(facilityId);
                    RecipeDefinition recipe = facility == null ? null : GetRecipe(world, facility.Kind);
                    if (recipe != null && !facility.Inventory.TryRemove(recipe.Input, recipe.InputCount))
                        throw new System.InvalidOperationException("Reserved production input disappeared before destruction.");
                }
            }
            machines.Remove(facilityId);
        }

        public void Tick(GameWorld world, long currentMilliseconds, long elapsedMilliseconds)
        {
            if (elapsedMilliseconds <= 0 || world == null) return;

            RecipeDefinition ironworks = world.Definitions.IronworksRecipe.ToDefinition();
            RecipeDefinition ammunition = world.Definitions.AmmunitionRecipe.ToDefinition();
            RecipeDefinition refinery = world.Definitions.RefineryRecipe.ToDefinition();
            for (int i = 0; i < world.Facilities.Count; i++)
            {
                FacilityState facility = world.Facilities[i];
                switch (facility.Kind)
                {
                    case FacilityKind.Ironworks:
                        TickFacility(world, facility, ironworks, currentMilliseconds, elapsedMilliseconds);
                        break;
                    case FacilityKind.AmmunitionFactory:
                        TickFacility(world, facility, ammunition, currentMilliseconds, elapsedMilliseconds);
                        break;
                    case FacilityKind.Refinery:
                        TickFacility(world, facility, refinery, currentMilliseconds, elapsedMilliseconds);
                        break;
                }
            }
        }

        private void TickFacility(GameWorld world, FacilityState facility, RecipeDefinition recipe,
            long currentMilliseconds, long elapsedMilliseconds)
        {
            if (facility == null || facility.IsDestroyed || facility.IsUnderConstruction || facility.IsDemolishing) return;
            if (!machines.TryGetValue(facility.Id, out MachineProgress progress))
            {
                progress = new MachineProgress();
                machines.Add(facility.Id, progress);
            }

            if (progress.TransactionId == null)
            {
                if (facility.Inventory.GetAvailable(recipe.Input) < recipe.InputCount ||
                    facility.Inventory.GetFreeCapacity(recipe.Output) < recipe.OutputCount)
                {
                    return;
                }

                progress.TransactionId = facility.Id + ":craft:" + progress.CompletedCycles;
                progress.ReservationId = progress.TransactionId + ":input";
                progress.ProgressMilliseconds = 0;
                if (!world.InventoryLedger.TryReserve(progress.ReservationId, facility.Inventory, recipe.Input, recipe.InputCount))
                {
                    progress.TransactionId = null;
                    progress.ReservationId = null;
                    return;
                }
            }

            progress.ProgressMilliseconds = (int)System.Math.Min(recipe.DurationMilliseconds,
                progress.ProgressMilliseconds + elapsedMilliseconds);

            if (progress.ProgressMilliseconds < recipe.DurationMilliseconds) return;

            if (!world.InventoryLedger.CommitCrafting(progress.TransactionId, progress.ReservationId,
                facility.Inventory, recipe.Output, recipe.OutputCount))
            {
                return;
            }

            progress.CompletedCycles++;
            world.Record(currentMilliseconds, "production",
                facility.Id + ":completed:" + progress.CompletedCycles + ":" + recipe.Output + ":" + recipe.OutputCount);
            progress.TransactionId = null;
            progress.ReservationId = null;
            progress.ProgressMilliseconds = 0;
        }

        private static RecipeDefinition GetRecipe(GameWorld world, FacilityKind kind)
        {
            switch (kind)
            {
                case FacilityKind.Ironworks: return world.Definitions.IronworksRecipe.ToDefinition();
                case FacilityKind.AmmunitionFactory: return world.Definitions.AmmunitionRecipe.ToDefinition();
                case FacilityKind.Refinery: return world.Definitions.RefineryRecipe.ToDefinition();
                default: return null;
            }
        }
    }

    public sealed class MachineProgress
    {
        internal static readonly MachineProgress Empty = new MachineProgress();

        internal MachineProgress()
        {
        }

        public int ProgressMilliseconds { get; internal set; }
        public int CompletedCycles { get; internal set; }
        internal string TransactionId { get; set; }
        internal string ReservationId { get; set; }
    }
}
