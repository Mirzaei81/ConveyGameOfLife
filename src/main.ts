class ConvoyGOL {
  adapter:GPUAdapter;
  ctx:GPUCanvasContext;
  device:GPUDevice
  pass:GPURenderPassEncoder
  canvasFormat:GPUTextureFormat
  encoder:GPUCommandEncoder
  pipeLine:GPURenderPipeline
  pipeLineLayout:GPUPipelineLayout
  stateBuffer:GPUBuffer[]
  gridBuffer:GPUBuffer
  bindingGroupLayout:GPUBindGroupLayout
  computePipeLine:GPUComputePipeline
  shader: {
    vertexBuffer: GPUBuffer;
    vertex: Float32Array;
  }
  gridSize =32;
  UPDATE_INTERVAL = 200; // Update every 200ms (5 times/sec)
  step = 0; // Track how many simulation steps have been run

  app = document.querySelector("#app") as HTMLCanvasElement
  WORKEUP_SIZE = 8;

  constructor() {

    if (!navigator.gpu) {
      alert("webgpu not supported on ypu're browser w8 decade maybe chrome 'll cath up :D")
    }

    this.ctx = this.app.getContext("webgpu")
    if (!this.ctx) {
      alert("Browser Does not support webgpu")
    }
    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  }
  async initializer(){
    this.adapter =await  navigator.gpu.requestAdapter()
      if (!this.adapter) {
        alert("No appropiate adapter had found")
      }
    this.device =await  this.adapter!.requestDevice()
    if (!this.device) {
      alert("Can't create instence of device from given adapter")
    }
    this.ctx!.configure({
      device: this.device,
      format: this.canvasFormat,
    });
    this.setup()
  }
setup() {
  this.bindingGroupLayout = this.device.createBindGroupLayout({
    label: "ComputeShaderBindingGroupLayout",
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: {type:"uniform"}
    }, {
      binding: 1,
      visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
      buffer: { type: "read-only-storage" }//cellSteateInput
    }, {
      binding: 2,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "storage" }//cellSteateOutPut
    },
    ]
  })
  this.pipeLineLayout= this.device.createPipelineLayout({
    label:"Cell PipeLine Layout",
    bindGroupLayouts:[this.bindingGroupLayout]
  })
  this.shader = this.initvertexShader()
  this.gridBuffer = this.createGrid()
  this.stateBuffer = this.cellState()
  setInterval(this.mainLoop.bind(this),this.UPDATE_INTERVAL)
}
mainLoop(){
  this.encoder = this.device!.createCommandEncoder();
  const computerpass = this.encoder.beginComputePass();
  computerpass.setPipeline(this.computePipeLine)
  computerpass.setBindGroup(0,this.bindingGroup()[this.step%2])
  const workgroupCounts = Math.ceil(this.gridSize/this.WORKEUP_SIZE)
  computerpass.dispatchWorkgroups(workgroupCounts,workgroupCounts)
  computerpass.end();
  this.step++;
  const pass = this.createEncoder();
  pass.setPipeline(this.pipeLine)
  pass.setVertexBuffer(0,this.shader.vertexBuffer)
  pass.setBindGroup(0,this.bindingGroup()[this.step%2]);
  pass.draw(this.shader.vertex.length/2,this.gridSize*this.gridSize)
  pass.end()
  this.device!.queue.submit([this.encoder.finish()])
  this.ctx?.getCurrentTexture()
}

createEncoder(){
  return( 
    this.encoder.beginRenderPass({
      colorAttachments: [{
        view: this.ctx!.getCurrentTexture().createView(),
        loadOp: "clear",
        clearValue: [0, 0, 0.4, 1],
        storeOp: "store",
      }]
    })
  )
}
bindingGroup(){
  let bindgroup = [
    this.device.createBindGroup({
      label: "Cell renderer bind group A",
      layout: this.bindingGroupLayout,
      entries: [{
        binding:0,
        resource:{buffer: this.gridBuffer}
      },{
        binding:1,
        resource:{buffer: this.stateBuffer[0]}
      },{
        binding:2,
        resource:{buffer:this.stateBuffer[1]}
      }]
    }),
    this.device.createBindGroup({
      label:"Cell Rendering binfGroup B ",
      layout: this.bindingGroupLayout,
      entries:[{
        binding:0,
        resource:{buffer:this.gridBuffer}
      },
      {
        binding:1,
        resource:{buffer:this.stateBuffer[1]}
      },{
        binding:2,
        resource:{buffer:this.stateBuffer[0]}
      }]
    })
    ]
    return bindgroup
}
createGrid(){
  const uniform = new Float32Array([this.gridSize,this.gridSize]);
  const uniformBuffer = this.device!.createBuffer({
    label:"gridBuffer",
    size:uniform.byteLength,
    usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,
  })
  this.device.queue.writeBuffer(uniformBuffer,0,uniform)
  return uniformBuffer
}

cellState(){
  const cellStateArr = new Uint32Array(this.gridSize*this.gridSize);
  const cellStageStorage = [
   this.device!.createBuffer({
    label:"Cell states A",
    size:cellStateArr.byteLength,
    usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST
  }),
   this.device!.createBuffer({
    label:"Cell states B",
    size:cellStateArr.byteLength,
    usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST
  })
]
for(let i=0;i<cellStateArr.length;i++){
  const state =Math.random() > .5?1:0;
  cellStateArr[i] = state
}
  this.device.queue.writeBuffer(cellStageStorage[0],0,cellStateArr);
  return cellStageStorage;
}
initvertexShader(){
  const vertex = new Float32Array([
    // x     y 
    -0.8, -0.8, // Triangle 1 (Blue)
    0.8, -0.8,
    0.8,  0.8,
 
   -0.8, -0.8, // Triangle 2 (Red)
    0.8,  0.8,
      -0.8, 0.8,
    ])
    const vertexBuffer = this.device.createBuffer({
      label: "Simple Squere",
      size: vertex.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    })
    this.device.queue.writeBuffer(vertexBuffer, 0, vertex)
    const vertexbufferLayout: GPUVertexBufferLayout = {
      arrayStride: 8,
      attributes: [{
        format: "float32x2",
        offset: 0,
        shaderLocation: 0
      }]
    }
    const simulationShaderModule=  this.device.createShaderModule({
      label:"Simualtion ComputeShader",
      code:`
      @group(0) @binding(0) var<uniform> grid:vec2f;
      @group(0) @binding(1) var<storage> cellStateIn: array<u32>; 
      @group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;

      fn cellIndex(cell:vec2u)->u32{
        return (cell.y %u32(grid.y))*u32(grid.x)+(cell.x%u32(grid.x));
      }

      fn cellActive(x:u32,y:u32)->u32{
        return cellStateIn[cellIndex(vec2u(x,y))];
      }
      @compute
      @workgroup_size(${this.WORKEUP_SIZE},${this.WORKEUP_SIZE})
      fn computeMain(@builtin(global_invocation_id) cell:vec3u){
        let cellActive =  cellActive(cell.x-1,cell.y-1)+
          cellActive(cell.x-1,cell.y-1)+
          cellActive(cell.x-1,cell.y)+
          cellActive(cell.x-1,cell.y+1)+
          cellActive(cell.x,cell.y-1)+
          cellActive(cell.x,cell.y+1)+
          cellActive(cell.x-1,cell.y-1)+
          cellActive(cell.x-1,cell.y)+
          cellActive(cell.x-1,cell.y+1);
        let i = cellIndex(cell.xy);
          switch(cellActive){
            case 2:{
              cellStateOut[i] = cellStateIn[i];
            }
            case 3:{
              cellStateOut[i] = 1;
            }
            default:{
              cellStateOut[i] = 0;
            }
          }
      } 
      `
    })
    const cellShaderModule = this.device.createShaderModule({
      label: "Cell Shader",
      code: `
    struct vertexInput{
      @location(0) pos:vec2f,
      @builtin(instance_index) instance: u32,
    };
    struct outputVertex{
      @builtin(position) pos:vec4f,
      @location(0) cell:vec2f
    };

    @group(0) @binding(0) var<uniform> grid: vec2f;
    @group(0) @binding(1) var<storage> cellState: array<u32>;

    @vertex
    fn vertexMain(input:vertexInput) -> outputVertex{
      let i = f32(input.instance);
      let cell =  vec2f(i%grid.x,floor(i/grid.y));
      let state = f32(cellState[input.instance]);

      let cellofset = cell/grid*2;
      let gridPos =(input.pos*state +1)/grid-1+cellofset;

      var opt :  outputVertex;
      opt.pos = vec4f(gridPos,0,1);
      opt.cell = cell;
      return opt;
    };

    @fragment
    fn fragmentMain(input:outputVertex) -> @location(0) vec4f {
      let c = input.cell/grid;
      return vec4f(c,1-c.x,1);
    }
    `
    })

    this.computePipeLine = this.device.createComputePipeline({
      label: "ComputeShderPipeLine",
      layout: this.pipeLineLayout,
      compute:{
        module: simulationShaderModule,
        entryPoint: "computeMain",
      }
    })
    this.pipeLine = this.device.createRenderPipeline({
      label: "render PipeLine",
      layout: this.pipeLineLayout,
      vertex: {
        module: cellShaderModule,
        entryPoint: "vertexMain",
        buffers: [vertexbufferLayout]
      },
      fragment: {
        module: cellShaderModule,
        entryPoint: "fragmentMain",
        targets: [{
          format: this.canvasFormat
        }]
      }

    })
    return { simulationShaderModule, vertexBuffer, vertex };
  }
}

const game = new ConvoyGOL();
(async ()=>{
  await game.initializer()
})()

