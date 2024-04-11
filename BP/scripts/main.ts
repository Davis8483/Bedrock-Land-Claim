import { world, system, Player } from '@minecraft/server';
import { ActionFormData, MessageFormData, ModalFormData } from '@minecraft/server-ui';

var shovelID = "lca:claim_shovel"

// check if database property exsists
if (!(world.getDynamicPropertyIds().includes("db"))) {
    world.setDynamicProperty("db", "{}")
}

// load the database property in a dict
var database = JSON.parse(world.getDynamicProperty("db").toString());

function saveDb() {
    world.setDynamicProperty("db", JSON.stringify(database));
};

function createClaim(player: Player, start: [x: number, y: number, z: number], end: [x: number, y: number, z: number]) {
    var claims: {} = database[player.name]["claims"];

    const form = new ModalFormData()
        .title("New Claim")
        // .body("Crazy, I was crazy once. They locked me in a room, a rubber room. A rubber room with rats, and rats make me crazy.")
        .textField("Name", "Ex: Home")
        .toggle("Public Access", true)

    form.show(player).then((response) => {

        if (!response.canceled) {

            var name = response.formValues[0].toString();
            var hasPublicAccess = response.formValues[1];
            if (name in claims) {
                player.runCommandAsync(`tellraw @s {"rawtext":[{"text":"[§eLCA§r] §cYou can't use the name of an existing claim!"}]}`);
                player.playSound("mob.creeper.say");
            }
            else {
                // generate dict for the new claim
                claims[name] = {
                    "start": start,
                    "end": end,

                    "public": {
                        "access": hasPublicAccess,
                        "permisions": {
                            "break-blocks": false,
                            "place-blocks": false
                        }
                    },
                    "whitelist": {}

                }
                player.runCommandAsync(`/tellraw @s {"rawtext":[{"text":"[§eLCA§r] Claim created!"}]}`);
                player.playSound("random.levelup");
            }
        }
        saveDb();

    });
}

world.afterEvents.playerJoin.subscribe((data) => {
    // verify player data is on file

    // set up player database
    if (!(data.playerName in database)) {

        database[data.playerName] = {
            "first-point": {
                "is-selected": false,
                "x": 0,
                "y": 0,
                "z": 0
            },
            "claims": {
                /*Ex:
                "home":{

                }
                */
            }
        };
    }

    world.sendMessage(JSON.parse(world.getDynamicProperty("db").toString())[data.playerName]["first-point"]["is-selected"])

    // reset claim shovel selection
    database[data.playerName]["first-point"]["is-selected"] = false;

    // save changes to the database
    saveDb();

});

world.afterEvents.playerSpawn.subscribe((data) => {
    world.sendMessage("db:" + JSON.stringify(database));
    // make sure player has a claim shovel
    data.player.runCommandAsync(`execute if entity @s [hasitem={item=${shovelID}, quantity=0}] run give @s ${shovelID} 1 0 {"keep_on_death": {}, "item_lock":{"mode":"lock_in_inventory"}}`);
});

// open menu when claim shovel is used
world.afterEvents.itemUse.subscribe((data) => {

    if (data.itemStack.typeId == shovelID) {
        const form = new ActionFormData()
            .title("Test")
            .body("Crazy, I was crazy once. They locked me in a room, a rubber room. A rubber room with rats, and rats make me crazy.")
            .button("I do nothing")
            .button("imagine how cringe it would be if you clicked me")

        form.show(data.source).then((response) => {
            if (response.selection === 1) {
                world.sendMessage("Truly cringe");
            };
        });
    };
});

world.beforeEvents.itemUseOn.subscribe((data) => {

    if (data.itemStack.typeId != shovelID) {

        world.sendMessage("your not allowed to place blocks");

        data.cancel = true;
    }

});

// Set/adjust claim points if player is sneaking
world.beforeEvents.playerBreakBlock.subscribe((data) => {

    // handle creating claims by setting first and second point
    if (data.itemStack.typeId == shovelID) {
        // stop the shovel from breaking the block
        data.cancel = true

        var firstPoint = database[data.player.name]["first-point"];

        if (!firstPoint["is-selected"]) {
            firstPoint["is-selected"] = true;

            firstPoint["x"] = data.block.x;
            firstPoint["y"] = data.block.y;
            firstPoint["z"] = data.block.z;

            data.player.runCommandAsync("/particle lca:first_point " + data.block.x + " " + (data.block.y + 1) + " " + data.block.z)
            data.player.sendMessage("First point selected: (" + data.block.x + ", " + data.block.y + ", " + data.block.z + ")");

        }
        else {
            firstPoint["is-selected"] = false;

            world.sendMessage("Second point selected");

            system.run(() => {
                createClaim(data.player, [firstPoint["x"], firstPoint["y"], firstPoint["z"]], [data.block.x, data.block.y, data.block.z]);
            });

        }

        // save changes to the database
        saveDb();

    }
});

// // runs code every 15 ticks
// system.runInterval(() => {
// },
//     15
// );

