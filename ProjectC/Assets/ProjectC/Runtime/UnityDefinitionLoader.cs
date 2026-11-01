using System;
using ProjectC.Core;
using UnityEngine;

namespace ProjectC.Runtime
{
    internal static class UnityDefinitionLoader
    {
        public static GameDefinitions Load()
        {
            TextAsset asset = Resources.Load<TextAsset>("ProjectC/GameDefinitions");
            if (asset == null) throw new InvalidOperationException("Missing Resources/ProjectC/GameDefinitions.json.");

            GameDefinitions definitions = JsonUtility.FromJson<GameDefinitions>(asset.text);
            if (definitions == null) throw new InvalidOperationException("Could not read Project C game definitions.");
            definitions.Validate();
            return definitions;
        }
    }
}
