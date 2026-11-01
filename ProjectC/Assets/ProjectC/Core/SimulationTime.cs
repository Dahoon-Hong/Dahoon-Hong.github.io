using System;

namespace ProjectC.Core
{
    public enum GameSpeed
    {
        Paused = 0,
        One = 1,
        Two = 2,
        Four = 4
    }

    /// <summary>Game time is stored as integer milliseconds so 3899.95 seconds is exact.</summary>
    public sealed class SimulationClock
    {
        private decimal fractionalMilliseconds;
        private GameSpeed speedBeforePause = GameSpeed.One;

        public long Milliseconds { get; private set; }
        public GameSpeed Speed { get; private set; } = GameSpeed.One;

        public void SetPaused(bool paused)
        {
            if (paused)
            {
                if (Speed != GameSpeed.Paused) speedBeforePause = Speed;
                Speed = GameSpeed.Paused;
            }
            else if (Speed == GameSpeed.Paused)
            {
                Speed = speedBeforePause;
            }
        }

        public void SetSpeed(GameSpeed speed)
        {
            if (speed != GameSpeed.Paused && speed != GameSpeed.One && speed != GameSpeed.Two && speed != GameSpeed.Four)
            {
                throw new ArgumentOutOfRangeException(nameof(speed));
            }

            if (speed == GameSpeed.Paused)
            {
                SetPaused(true);
                return;
            }

            Speed = speed;
            speedBeforePause = speed;
        }

        public long AdvanceRealSeconds(double realSeconds)
        {
            if (double.IsNaN(realSeconds) || double.IsInfinity(realSeconds) || realSeconds < 0d)
            {
                throw new ArgumentOutOfRangeException(nameof(realSeconds));
            }

            if (Speed == GameSpeed.Paused || realSeconds == 0d)
            {
                return 0;
            }

            decimal gameMilliseconds = (decimal)realSeconds * 1000m * (int)Speed + fractionalMilliseconds;
            long elapsed = decimal.ToInt64(decimal.Floor(gameMilliseconds));
            fractionalMilliseconds = gameMilliseconds - elapsed;
            Milliseconds = checked(Milliseconds + elapsed);
            return elapsed;
        }

        public void AdvanceGameMilliseconds(long milliseconds)
        {
            if (milliseconds < 0)
            {
                throw new ArgumentOutOfRangeException(nameof(milliseconds));
            }

            Milliseconds = checked(Milliseconds + milliseconds);
        }

        internal void ClampToGameMilliseconds(long milliseconds)
        {
            if (milliseconds < 0 || milliseconds > Milliseconds) throw new ArgumentOutOfRangeException(nameof(milliseconds));
            Milliseconds = milliseconds;
            fractionalMilliseconds = 0m;
        }
    }
}
