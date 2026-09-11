from fastapi import APIRouter, Depends, HTTPException
from ..schemas import TaskCreate
from ..database import session, get_db
from ..models import Task
from ..security import auth

router = APIRouter(prefix="/tasks", tags=["Tasks"])

#CREATE
@router.post("/create-task")
def create_task(task: TaskCreate, db = Depends(get_db), current_user = Depends(auth.get_current_user)):
    new_task = Task(**task.model_dump(), user_id=current_user.id) 
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task

#READ
@router.get("/get-tasks")
def get_tasks(db = Depends(get_db), current_user = Depends(auth.get_current_user)):
    try:
        task = db.query(Task).filter(Task.user_id == current_user.id).order_by(Task.title.asc()).all()
        return task
    except Exception as e:
        print(f"Error retrieving tasks: {e}")

#READ single task
@router.get("/get-task/{task_id}")
def get_task(task_id: int, db = Depends(get_db), current_user = Depends(auth.get_current_user)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You are not authorized to access this task")
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

#UPDATE
@router.put("/update-task")
def update_task(id: int, task: TaskCreate, db = Depends(get_db), current_user = Depends(auth.get_current_user)):
    existing_task = db.query(Task).filter(Task.id == id).first()

    if not existing_task:
        raise HTTPException(status_code=404, detail="Task not found")

    if existing_task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You are not authorized to update this task")

    for key, value in task.model_dump().items():
        setattr(existing_task, key, value)
    
    db.commit()
    db.refresh(existing_task)
    return existing_task

#DELETE
@router.delete("/delete-task")
def delete_task(id: int, db = Depends(get_db), current_user = Depends(auth.get_current_user)):
    task = db.query(Task).filter(Task.id == id).first()

    if task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You are not authorized to delete this task")

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    db.delete(task)
    db.commit()
    return {"message": "Task deleted successfully"}
