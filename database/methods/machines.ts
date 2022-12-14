import { v4 as uuidv4 } from 'uuid';

import seedrandom from 'seedrandom'
import chat from '../../index'
import jkstra from 'jkstra'

export default {
  /**
   * from blueprints to concrete concept
   */
  async assemble (db: any) {
    let secretOptimizer = chat.SecretOptimizer.getInstance()
    let mechanics = await secretOptimizer.createMechanics(this)

    /**
     * begin: 0
     */
    mechanics.nodes.push(
      mechanics.structure.addVertex({ id: this.id, part: "genesis" })
    );

    /**
     * end: 1
     */
    mechanics.nodes.push(
      mechanics.structure.addVertex({ id: this.id, part: "infinity" })
    );

    // fabric: 2, 3, 4...

    /**
     * rotors from right to left
     */
    let rotorsRTL = await db.rotors.find({
      selector: {
        seed: this.seed,
        machine: this.id
      },
      sort: [
        { order: 'desc' } // always start in this order for RTL
      ]
    }).exec()
    
    let enterRotor: any
    let inRotor: any
    let spunRotorsRTL: Array<any> = []
    if (rotorsRTL) {
      let index = 0
      for (const rotor of rotorsRTL) {
        let part = await rotor.assemble(db, mechanics, false)
        if (index === 0) {
          enterRotor = part // first rotor
        } else if (index === rotorsRTL.length - 1) {
          inRotor = part // last rotor
        }
        spunRotorsRTL.push(part)
        index++
      }
    }

    // debug
    console.log('spunRotorsRTL', spunRotorsRTL.length)

    /**
     * rotors from left to right
     */
    let rotorsLTR = await db.rotors.find({
      selector: {
        seed: this.seed,
        machine: this.id
      },
      sort: [
        { order: 'asc' } // always start in this order for LTR
      ]
    }).exec()

    let outRotor: any
    let exitRotor: any
    let spunRotorsLTR: Array<any> = []
    if (rotorsLTR) {
      let index = 0
      for (const rotor of rotorsLTR) {
        let part = await rotor.assemble(db, mechanics, true)
        if (index === 0) {
          outRotor = part // first rotor
        } else if (index === rotorsLTR.length - 1) {
          exitRotor = part // last rotor
        }
        spunRotorsLTR.push(part)
        index++
      }
    }

    // debug
    console.log('spunRotorsLTR', spunRotorsLTR.length)

    /**
     * reflector
     */
    let reflector = await db.reflectors.findOne({
      selector: {
        seed: this.seed,
        machine: this.id
      }
    }).exec()

    if (reflector) {
      await reflector.assemble(db, mechanics, inRotor, outRotor)
    }

    /**
     * plugboard
     */
    let plugboard = await db.plugboards.findOne({
      selector: {
        seed: this.seed,
        machine: this.id
      }
    }).exec()

    if (plugboard) {
      await plugboard.assemble(db, mechanics, enterRotor, exitRotor)
    }

    /**
     * link rotors: outbound
     */
    for (let i = 0; i < this.targetRotorCount; i++) {
      let right
      let left
      if (i === 0) {
        // first rotor passing signals from plugboard
        right = spunRotorsRTL[i].rotorLeftPorts
        left = spunRotorsRTL[i + 1].rotorRightPorts
      } else {
        // all the other rotors
        right = spunRotorsRTL[i - 1].rotorLeftPorts
        left = spunRotorsRTL[i].rotorRightPorts
      }

      // link crosswires
      for (let i = 0; i < this.targetCombinationCount; i++) {
        let edge = {
          direction: false, // right to left
          inCrosswireOrder: right[i].crosswire.leftPortOrder,
          outCrosswireOrder: left[i].crosswire.rightPortOrder,
          length: 0, // signals pass on to the next rotor without delay
          part: 'link'
        }
        mechanics.structure.addEdge(right[i].node, left[i].node, edge)
      }
    }

    /**
     * link rotors: inbound
     */
    for (let i = 0; i < this.targetRotorCount; i++) {
      let left
      let right
      if (i === 0) {
        // first rotor passing signals to plugboard
        left = spunRotorsLTR[i].rotorRightPorts
        right = spunRotorsLTR[i + 1].rotorLeftPorts
      } else {
        // all the other rotors
        left = spunRotorsLTR[i - 1].rotorRightPorts
        right = spunRotorsLTR[i].rotorLeftPorts
      }

      // link crosswires
      for (let i = 0; i < this.targetCombinationCount; i++) {
        let edge = {
          direction: true, // left to right
          inCrosswireOrder: left[i].crosswire.rightPortOrder,
          outCrosswireOrder: right[i].crosswire.leftPortOrder,
          length: 0, // signals pass on to the next rotor without delay
          part: 'link'
        }
        mechanics.structure.addEdge(left[i].node, right[i].node, edge)
      }
    }

    /**
     * parts connected
     */
    return mechanics
  },

  /**
   * a way to transmit words within a sentence
   */
  async channel (db: any, chunks: string) {
    let streams = chunks.split(this.layerBy)
    let that = this

    let messages = []
    let index: number = 0
    for (const stream of streams) {
      index++ // for every stream

      let channelCount = index
      let value = await that.stream(db, stream, channelCount)
      messages.push(value)
    }

    let scrambled = []
    messages.forEach((value, index) => {
      scrambled.push(value.scrambled)
    })

    return {
      original: chunks,
      scrambled: scrambled.join(' '),
      messages
    }
  },
  /**
   * a way to transmit letters within a word
   */
  async stream (db: any, chunk: string, channelCount: number) {
    let letters = chunk.split('')
    let code = []
    let that = this
    let entropy = ''
      
    let index = 0
    for (const letter of letters) {
      index++ // for every letter

      // any letter a-z
      let plainText: string = letter // 1 char limit
      // console.log('plainText', plainText) // noisy
    
      let keyPressCount = index
      let encrypted = await that.encrypt(db, channelCount, keyPressCount, plainText, entropy)
      // console.log('encrypted', encrypted) // noisy

      // feed scrambled results back into the algorythum
      entropy = encrypted
    
      // todo: leave this out for speed and move to a different mothod
      // let decrypted = await that.decrypt(db, channelCount, keyPressCount, plainText)
      // // console.log('decrypted', decrypted) // noisy

      code.push({
        plainText,
        encrypted
      })
    }

    let scrambled = []
    code.forEach((value, index) => {
      scrambled.push(value.encrypted)
    })

    return {
      original: chunk,
      scrambled: scrambled.join(''),
      code
    }
  },
  /**
   * a way to transform 1 letter into another letter 
   */
  async cipher(db: any, channelCount: number, keyPressCount: number, letter: string, entropy: string) {
    // find out what combination this letter is
    let combination = await db.combinations.findOne({
      selector: {
        letter: letter,
        machine: this.id
      }
    }).exec()

    let ciphertext: string = ''
    if (combination) {
      console.log('combination', combination.number)
      if (channelCount === 1 && keyPressCount === 1) {
        console.log('scramble & assemble')
        await this.scramble(db)
        await this.assemble(db)
      } else {
        await this.tick(db, channelCount, keyPressCount, entropy)
      }
      ciphertext = await this.runCalculation(db, letter)
    } else {
      console.log('combination not found')
    }

    return ciphertext
  },
  async encrypt(db: any, channelCount: number, keyPressCount: number, letter: string, entropy: string) {
    return await this.cipher(db, channelCount, keyPressCount, letter, entropy)
  },
  async decrypt(db: any, channelCount: number, keyPressCount: number, letter: string, entropy: string) {
    return await this.cipher(db, channelCount, keyPressCount, letter, entropy)
  },
  /**
   * a way to randomly organize things
   */
  scramble: async function (db: any) {
    // scramble these rotors
    let machineRotors = await db.rotors.find({
      selector: {
        seed: this.seed,
        machine: this.id
      },
      sort: [
        { createdAt: 'asc' } // always start in this order
      ]
    }).exec()

    function randomIntFromInterval(randomSpin, min, max) { // min and max included 
      return Math.floor(randomSpin * (max - min + 1) + min)
    }
    
    // randomly order rotors
    let quorum = await db.quorums.findOne(this.quorum).exec()
    let environment = `${quorum.environment.galaxy}:${quorum.environment.star}:${quorum.environment.core}`
    let seed = `${this.seed}:${environment}:machine-${this.order}`
    let rng = seedrandom.xor4096(seed)
    console.log(seed)
    if (machineRotors) {
      for (const rotor of machineRotors) {
        let query = db.rotors.find({
          selector: {
            id: rotor.id
          }
        })
        await query.update({
          $set: {
            order: rng(),
            shift: randomIntFromInterval(rng(), 1, this.targetCombinationCount) - 1, // random spin: pick a number between 0 (min) and X (max) of total combinations
            direction: Boolean(randomIntFromInterval(rng(), 0, 1))
          }
        })

        await rotor.scramble(db)
        // console.log('scramble rotor', rotor.id) // noisy
      }
    }

    // randomly arrange plugboard input/outout connections
    let machinePlugboard = await db.plugboards.findOne({
      selector: {
        seed: this.seed,
        machine: this.id
      }
    }).exec()

    await machinePlugboard.scramble(db)
  },
  tick: async function (db: any, channelCount: number, keyPressCount: number, entropy: string) {
    console.log('tick', channelCount, keyPressCount, entropy)
  },
  runCalculation: async function (db: any, letter: string) {
    // grab machine from mechanics
    let secretOptimizer = chat.SecretOptimizer.getInstance()

    let mechanics = await secretOptimizer.getMechanics(this)
    // let workingParts = {
    //   blueprint: machine.id,
    //   structure: graph,
    //   nodes: [],
    //   completeId: 1,
    // }
    let dijkstra = new jkstra.algos.Dijkstra(mechanics.structure);

    // find graph starting node based on letter
    let startNode = mechanics.nodes.findIndex((value, index) => {
      if (value.data.part === 'plugboard' && value.data.level === 1) {
        return value.data.combination.letter === letter
      } else {
        return false
      }
    })

    console.log('scramble letter', mechanics.nodes[startNode].data.combination.letter, mechanics.completeId)
    console.log('scramble position', startNode)
    console.log('scramble distination', mechanics.completeId)

    // computes the shortestPath between nodes 0 and 1,
    // using the single number stored in each as its cost
    // current: mechanics.nodes[startNode]
    // target: mechanics.nodes[mechanics.completeId]
    // firstLevelPorts 2732
    // secondLevelPorts 2758
    // left to right
    // rotorRightPorts 28
    // rotorLeftPorts 54
    // rotorRightPorts 1328
    // rotorLeftPorts 1354
    // right to left
    // rotorRightPorts 1380
    // rotorLeftPorts 1406
    // rotorRightPorts 2680
    // rotorLeftPorts 2706

    let path = dijkstra.shortestPath(mechanics.nodes[startNode], mechanics.nodes[mechanics.completeId], {
      edgeCost: function (e) {
        if (e.data.part === 'crosswire') {
          return e.data.length; // distance
        } else {
          return 0;
        }
      },
    });
    
    // causeEdge.data // => {length: 0.5, combination: {a}, part: 'keyboard'}
    // effectEdge.data // => {length: 0.5, combination: {a}, part: 'lightboard'}
    // let route = path
    //   .map(function (e) {
    //     return e.data;
    //   })
    //   .join()

    for (const edge of path) {
      console.log('route through', edge.data.part)

      // if (edge.data.part === 'crosswire') {
      //   console.log('crosswire direction', edge.data.direction)
      //   console.log('crosswire inPortOrder', edge.data.inPortOrder)
      //   console.log('crosswire distance', edge.data.length)
      //   console.log('crosswire outPortOrder', edge.data.outPortOrder)
      // } else if (edge.data.part === 'reflector') {
      //   console.log('reflector direction', null)
      //   console.log('reflector inPortOrder', edge.data.inPortOrder)
      //   console.log('reflector distance', edge.data.length)
      //   console.log('reflector outPortOrder', edge.data.outPortOrder)
      // } else if (edge.data.part === 'link') {
      //   console.log('link direction', edge.data.direction)
      //   console.log('link inCrosswireOrder', edge.data.inCrosswireOrder)
      //   console.log('link distance', edge.data.length)
      //   console.log('link outCrosswireOrder', edge.data.outCrosswireOrder)
      // } else if (edge.data.part === 'gateway') {
      //   console.log('gateway plugboardId', edge.data.plugboardId)
      //   console.log('gateway rotorGatewayId', edge.data.rotorGatewayId)
      // } else if (edge.data.part === 'plugboard') {
      //   console.log('plugboard from', edge.data.from.number, edge.data.from.letter)
      //   console.log('plugboard to', edge.data.to.number, edge.data.to.letter)
      // } else if (edge.data.part === 'keyboard') {
      //   console.log('keyboard combination', edge.data.combination.number, edge.data.combination.letter)
      // } else if (edge.data.part === 'lightboard') {
      //   console.log('lightboard combination', edge.data.combination.number, edge.data.combination.letter)
      // }
    }

    if (path === null) {
      // you can't get there from here
      return 'y'
    } else {
      // the last edge is our answer
      let cipherPath = path[path.length - 1]
  
      // return scambled letter
      if (cipherPath) {
        console.log('scrambled letter', cipherPath.data.combination.letter)
        return cipherPath.data.combination.letter
      } else {
        return 'z'
      }
    }
  },
  cleanupCombinations: async function (db: any) {
    let oldCombinations = await db.combinations.find({
      selector: {
        machine: this.id
      }
    }).exec()

    if (oldCombinations) {
      for (const record of oldCombinations) {
        await record.remove()
      }
    }
  },
  initCombinations: async function (db: any) {
    let combinations = []
    
    // create combinations
    let chars = this.alphabet.split('')

    let index = 0
    for (const char of chars) {
      index++ // increase per letter
      let combination = await db.combinations.insert({
        id: uuidv4(),
        letter: char,
        number: index,
        machine: this.id,
        createdAt: Date.now() + index
      })
      combinations.push(combination.id)
    }
    // console.log('machine', this.id, 'combinations', combinations)

    // add combinations to machine list
    let query = db.machines.find({
      selector: {
        id: this.id
      }
    })
    await query.update({
      $set: {
        combinations: combinations
      }
    })

    console.log('initCombinations', 'machine', this.id)
  },
  cleanupRotors: async function (db: any) {
    let oldRotors = await db.rotors.find({
      selector: {
        seed: this.seed,
        machine: this.id
      }
    }).exec()

    if (oldRotors) {
      for (const record of oldRotors) {
        await record.cleanupCrosswires(db)
        await record.remove()    
      }
    }
  },
  initRotors: async function (db: any) {
    let rotors = []

    // create rotors
    for (let i = 1; i <= this.targetRotorCount; i++) {
      let rotor = await db.rotors.insert({
        id: uuidv4(),
        seed: this.seed,
        machine: this.id,
        targetCrosswireCount: this.targetCombinationCount,
        createdAt: Date.now() + i
      })
      await rotor.initCrosswires(db)
      rotors.push(rotor.id)
    }
    // console.log('machine', this.id, 'rotors', rotors)

    // add rotors to machine list
    let query = db.machines.find({
      selector: {
        id: this.id
      }
    })
    await query.update({
      $set: {
        rotors: rotors
      }
    })

    console.log('initRotors', 'machine', this.id)
  },
  initReflector: async function (db: any) {
    // create reflector
    let reflector = db.reflectors.insert({
      id: uuidv4(),
      seed: this.seed,
      targetCombinationCount: this.targetCombinationCount,
      machine: this.id,
    })

    // add reflector to machine
    let query = db.machines.find({
      selector: {
        id: this.id
      }
    })
    await query.update({
      $set: {
        reflector: reflector.id
      }
    })

    console.log('initReflector', 'machine', this.id)
  },
  initPlugboard: async function (db: any) {
    // create plugboard
    let plugboard = db.plugboards.insert({
      id: uuidv4(),
      seed: this.seed,
      main: this.main,
      targetCombinationCount: this.targetCombinationCount,
      machine: this.id,
    })

    // add plugboard to machine
    let query = db.machines.find({
      selector: {
        id: this.id
      }
    })
    await query.update({
      $set: {
        plugboard: plugboard.id
      }
    })

    console.log('initPlugboard', 'machine', this.id)
  }
}